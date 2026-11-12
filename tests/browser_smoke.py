"""Verificação opcional com Playwright já instalado; não instala dependências.
Execute: python tests/browser_smoke.py
Todos os dados são fictícios, em perfis temporários do navegador.
"""
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from tempfile import TemporaryDirectory
import json
import os
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

def run():
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{server.server_port}/'
    try:
        with TemporaryDirectory() as tmp, sync_playwright() as p:
            options = {'headless': True, 'args': ['--no-sandbox']}
            binary = os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium')
            if Path(binary).exists():
                options['executable_path'] = binary
            browser = p.chromium.launch(**options)
            context = browser.new_context(accept_downloads=True)
            page = context.new_page()
            errors, requests = [], []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('request', lambda request: requests.append(request.url))
            accept = [True]
            page.on('dialog', lambda dialog: dialog.accept() if accept[0] else dialog.dismiss())
            page.goto(url)
            assert page.locator('#results .card').count() == 4
            assert page.locator('#categories details').count() == 11
            assert page.evaluate('CasaModel.budget(state).total') == 1539500

            def change(selector, value):
                page.locator(selector).fill(str(value))
                page.locator(selector).press('Tab')

            change('#field-cash', 100000)
            change('#field-preservedReserve', 20000)
            assert page.evaluate('CasaModel.resources(state).now') == 100000
            page.locator('#field-reserveAlreadyExcluded').uncheck()
            assert page.evaluate('CasaModel.resources(state).now') == 80000
            change('#field-familyHelp', 10000)
            page.locator('#field-includeFamilyHelp').check()
            assert page.evaluate('CasaModel.resources(state).now') == 90000
            change('#field-monthlySavings', 1000)
            assert page.evaluate('CasaModel.resources(state).projected') == 102000

            page.get_by_role('button', name='2 · Orçamento').click()
            change('#field-area', 200)
            assert page.evaluate('CasaModel.budget(state).construction') == 1000000
            assert page.locator('#field-scenarioName').input_value() == 'personalizado'
            page.locator('#field-constructionMode').select_option('global')
            assert page.evaluate('CasaModel.budget(state).construction') == 750000
            page.locator('#group-construction summary').click()
            change('#group-construction input[data-item="-1"][data-key="value"]', 800000)
            page.locator('#group-construction button[data-add-group]').click()
            change('#group-construction input[data-item="0"][data-key="value"]', 1000)
            assert page.evaluate('CasaModel.budget(state).construction') == 800000
            page.locator('#group-construction input[data-item="0"][data-key="includedInGroup"]').uncheck()
            assert page.evaluate('CasaModel.budget(state).construction') == 801000
            page.locator('#field-contingencyMode').select_option('percent')
            assert page.locator('#contingencyBase input:checked').count() == 9
            page.locator('#snapshotName').fill('Teste fictício de orçamento')
            page.get_by_role('button', name='Salvar cenário atual', exact=True).click()
            snapshot_id = page.evaluate('state.savedScenarios[0].id')

            # Cancelar a troca não substitui orçamento personalizado.
            accept[0] = False
            page.locator('#field-scenarioName').select_option('economico')
            assert page.locator('#field-scenarioName').input_value() == 'personalizado'
            assert page.evaluate('CasaModel.budget(state).construction') == 801000
            accept[0] = True
            page.locator('#field-scenarioName').select_option('economico')
            assert page.evaluate('CasaModel.budget(state).total') == 1121000
            assert page.evaluate('state.savedScenarios.length') == 2

            page.get_by_role('button', name='4 · Gastos reais').click()
            page.locator('#category').select_option('construction')
            page.locator('#description').fill('Registro fictício para teste')
            page.locator('#amount').fill('123')
            page.get_by_role('button', name='Registrar', exact=True).click()
            page.reload()
            page.get_by_role('button', name='4 · Gastos reais').click()
            assert page.locator('#expenses tr').count() == 1
            page.locator('#savedScenarios').select_option(snapshot_id)
            page.get_by_role('button', name='Recuperar cenário selecionado', exact=True).click()
            assert page.evaluate('CasaModel.budget(state).construction') == 801000
            assert page.locator('#expenses tr').count() == 1

            with page.expect_download() as download:
                page.get_by_role('button', name='Exportar dados JSON', exact=True).click()
            backup = Path(tmp) / 'backup.json'
            download.value.save_as(backup)
            data = json.loads(backup.read_text())
            assert data['version'] == 2 and len(data['state']['expenses']) == 1
            assert len(data['state']['savedScenarios']) == 2
            before = page.evaluate('localStorage.getItem(CasaModel.STORAGE_KEY)')
            invalid = Path(tmp) / 'invalid.json'
            invalid.write_text('{"version":2,"state":null}')
            page.locator('#import').set_input_files(invalid)
            page.wait_for_function("document.getElementById('storageMessage').textContent.includes('Importação não realizada')")
            assert page.evaluate('localStorage.getItem(CasaModel.STORAGE_KEY)') == before

            config = Path(tmp) / 'private.json'
            config.write_text(json.dumps({'type': 'consult-casa-config', 'version': 2, 'config': {'cash': 222000}}))
            page.locator('#privateConfig').set_input_files(config)
            page.wait_for_function('state.cash === 222000')
            assert page.locator('#expenses tr').count() == 1
            assert page.evaluate('state.savedScenarios.length') == 2
            page.get_by_role('button', name='Restaurar backup local anterior', exact=True).click()
            assert page.evaluate('state.cash') == 100000
            page.locator('#import').set_input_files(backup)
            page.wait_for_function("document.getElementById('storageMessage').textContent.includes('Arquivo validado')")
            assert page.evaluate('state.expenses[0].amount') == 123
            with page.expect_download() as csv_download:
                page.get_by_role('button', name='3 · Cenários').click()
                page.get_by_role('button', name='Baixar cronograma CSV').click()
            csv = Path(tmp) / 'schedule.csv'
            csv_download.value.save_as(csv)
            assert len(csv.read_text(encoding='utf-8-sig').splitlines()) == 241

            page.set_viewport_size({'width': 390, 'height': 844})
            page.get_by_role('button', name='1 · Premissas').click()
            assert page.locator('#field-cash').is_visible()
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
            assert not errors, errors
            assert all(request.startswith(url) for request in requests), requests
            context.close()

            # Migração da chave v1 no navegador, mantendo rubrica e valor do gasto.
            context = browser.new_context()
            page = context.new_page()
            page.goto(url)
            old = {'city': 'Cidade fictícia', 'reference': '', 'area': 100, 'm2': 1000,
                   'land': 200000, 'contingency': 10, 'cash': 100000,
                   'essential': 2000, 'emergencyMonths': 6,
                   'categories': [['ITBI, escritura/contrato e registro', 5000]],
                   'expenses': [{'id': 1, 'category': 'ITBI, escritura/contrato e registro',
                                 'date': '2026-10-01', 'description': 'Exemplo legado', 'amount': 200, 'status': 'Pago'}]}
            page.evaluate('(data) => {localStorage.clear();localStorage.setItem("consult-casa-v1",JSON.stringify(data));}', old)
            page.reload()
            assert page.evaluate('CasaModel.budget(state).total') == 315500
            assert page.evaluate('state.expenses[0].category') == old['expenses'][0]['category']
            assert page.evaluate('state.expenses[0].groupId') == 'documents'
            assert page.evaluate('localStorage.getItem("consult-casa-v1") !== null')
            context.close()
            browser.close()
            print('PASS: interface, 11 grupos, reserva, ajuda, construção, subitens, troca/cancelamento e recuperação de cenários, gastos persistentes, backup JSON, importação inválida/privada, restauração, CSV, migração v1, tela móvel e ausência de requisições externas.')
    finally:
        server.shutdown()
        server.server_close()

if __name__ == '__main__':
    run()
