"""Experiência dos quatro caminhos com dados fictícios; nenhum acesso externo."""
from browser_smoke import QuietHandler, ROOT
from functools import partial
from http.server import ThreadingHTTPServer
from threading import Thread
from pathlib import Path
from tempfile import TemporaryDirectory
from playwright.sync_api import sync_playwright
import os
import json


def run():
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{server.server_port}/'
    try:
        with TemporaryDirectory() as tmp, sync_playwright() as p:
            opts = {'headless': True, 'args': ['--no-sandbox']}
            executable = os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium')
            if Path(executable).exists():
                opts['executable_path'] = executable
            browser = p.chromium.launch(**opts)
            page = browser.new_page(accept_downloads=True)
            errors, requests = [], []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('request', lambda r: requests.append(r.url))
            page.on('dialog', lambda d: d.accept())
            page.goto(url)
            page.evaluate("""() => { const s=CasaModel.defaults(); Object.assign(s,{cash:120000,familyHelp:300000,includeFamilyHelp:true,
                preservedReserve:20000,reserveAlreadyExcluded:true,income:14000,essential:8000,monthlySavings:3000,
                grossIncome1:14000,bankPercent:30,comfortablePayment:2800,rent:1500,rentIncludedInExpenses:true,
                currentApartment:300000,largerApartment:500000,months:420});
                s.groups.forEach(g=>g.value=0);s.constructionMode='global';s.groups[6].value=120000;
                s.housing=Housing.defaults(s);s.housing.startDate='2027-01-01';s.housing.selectedPath='buyLarger';
                for(const p of Object.values(s.housing.paths)){if(p.first)p.first.entry=60000;p.second.entry=20000;p.second.buildMonths=6;
                if(p.buyCosts!==undefined)p.buyCosts=5000;if(p.saleCosts!==undefined)p.saleCosts=5000;if(p.secondBuyCosts!==undefined)p.secondBuyCosts=10000;}
                s.groups[6].subitems=Array.from({length:6},(_,i)=>({id:`phase-${i}`,description:`Medição ${i+1}`,value:20000,
                  source:'Proposta fictícia',referenceDate:'',status:'estimado',notes:'',includedInGroup:true,
                  measurement:true,measurementValue:20000,phaseEnd:FinancialEngine.addMonths('2027-01-01',i),releaseDelayDays:0}));
                CasaModel.persist(localStorage,CasaModel.validate(s)); }""")
            page.reload()
            page.get_by_role('button', name='3 · Cenários').click()
            assert page.locator('#housingPath option').count() == 4
            assert page.locator('#scenarios input[id*="income"]').count() == 0
            assert page.locator('#plannerContract').count() == 0
            assert page.locator('#housingError').inner_text() == ''
            assert page.locator('.housing-timeline').count() == 1
            assert page.locator('.housing-timeline tbody tr').count() == 12
            first = page.locator('.housing-timeline tbody tr').first.inner_text()
            page.get_by_role('button', name='Próximos 12 meses', exact=True).click()
            assert page.locator('.housing-timeline tbody tr').first.inner_text() != first
            page.get_by_role('button', name='Voltar 12 meses', exact=True).click()
            assert page.locator('.housing-timeline tbody tr').first.inner_text() == first
            change_input = lambda selector, value: (page.locator(selector).fill(str(value)), page.locator(selector).press('Tab'))
            change_input('#home-second-credit', 250000)
            assert page.locator('#home-second-entry').input_value() == '250000'
            change_input('#home-second-entry', 120000)
            assert page.locator('#home-second-credit').input_value() == '380000'
            page.get_by_role('button', name='Todo o cronograma', exact=True).click()
            assert page.locator('.housing-timeline tbody tr').count() == 421
            page.get_by_role('button', name='Períodos anuais', exact=True).click()
            assert page.locator('.housing-timeline tbody tr').count() == 36
            with page.expect_download() as download:
                page.get_by_role('button', name='Baixar cronograma completo em CSV', exact=True).click()
            file = Path(tmp) / 'all.csv'
            download.value.save_as(file)
            assert len(file.read_text(encoding='utf-8-sig').splitlines()) == 422

            def change(selector, value):
                page.locator(selector).fill(str(value))
                page.locator(selector).press('Tab')

            page.locator('#housingPath').select_option('rentBuild')
            assert page.locator('.housing-timeline').count() == 1
            assert page.evaluate('Housing.calculate(state).initialCash') == 420000
            change('#home-second-months', 24)
            assert page.evaluate('Housing.calculate(state).loans[0].result.rows.length') == 24
            assert page.evaluate('Housing.calculate(state).summary.moveMonth') == 7
            change('#home-second-buildMonths', 12)
            assert page.evaluate('Housing.calculate(state).summary.moveMonth') == 13
            assert page.evaluate('Housing.calculate(state).loans[0].result.rows.length') == 24
            page.locator('#extra-second summary').click()
            change('#home-second-extraAmount', 10000)
            assert page.locator('#extra-second').get_attribute('open') is not None
            page.locator('#home-second-extraMode').select_option('payment')
            assert page.locator('#housingError').inner_text() == ''
            page.get_by_role('button', name='1 · Premissas').click()
            page.locator('#field-includeFamilyHelp').uncheck()
            change('#field-essential', 9000)
            assert page.evaluate('Housing.calculate(state).initialCash') == 120000
            assert page.evaluate('Housing.calculate(state).baseCapacity') == 2000
            page.get_by_role('button', name='3 · Cenários').click()
            page.locator('#housingPath').select_option('buyThenBuild')
            change('#home-stage2Month', 3)
            assert page.locator('.housing-timeline').count() == 2
            assert page.evaluate('Housing.calculate(state).rows.some(r=>r.byStage.first.recurring>0&&r.byStage.second.recurring>0)')
            page.locator('#housingPath').select_option('buyThenUpgrade')
            assert page.locator('.housing-timeline').count() == 2
            assert page.locator('#housingError').inner_text() == ''
            assert page.evaluate('Housing.calculate(state).sales.length') == 1
            assert page.evaluate('Housing.calculate(state).loans[0].result.totals.closingBalance') == 0
            page.locator('#snapshotName').fill('Troca fictícia')
            page.get_by_role('button', name='Salvar cenário atual', exact=True).click()
            snap = page.evaluate('state.savedScenarios.at(-1).id')
            page.locator('#housingPath').select_option('buyLarger')
            page.locator('#savedScenarios').select_option(snap)
            page.get_by_role('button', name='Recuperar cenário selecionado', exact=True).click()
            assert page.locator('#housingPath').input_value() == 'buyThenUpgrade'
            with page.expect_download() as backup:
                page.get_by_role('button', name='Exportar dados JSON', exact=True).click()
            data_file = Path(tmp) / 'data.json'
            backup.value.save_as(data_file)
            data = json.loads(data_file.read_text())
            assert data['version'] == 2 and data['state']['housing']['selectedPath'] == 'buyThenUpgrade'
            page.locator('#import').set_input_files(data_file)
            page.wait_for_function("document.getElementById('storageMessage').textContent.includes('Arquivo validado')")
            page.reload()
            page.get_by_role('button', name='3 · Cenários').click()
            assert page.locator('#housingPath').input_value() == 'buyThenUpgrade'
            page.set_viewport_size({'width':390,'height':844})
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
            page.screenshot(path='/tmp/vecto-cenarios-mobile.png', full_page=True)
            assert not errors, errors
            assert all(request.startswith(url) for request in requests), requests
            browser.close()
            print('PASS: quatro caminhos, poucos campos, duas etapas, navegação 12 meses/anos/completa, CSV integral, CET/obra, extra, ajuda, despesas, venda/quitação, cenários e backups, mobile e privacidade.')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    run()
