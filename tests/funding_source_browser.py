"""Origem por grupo e entrada manual da construção, com dados fictícios descartáveis."""
from browser_smoke import QuietHandler, ROOT
from functools import partial
from http.server import ThreadingHTTPServer
from threading import Thread
from tempfile import TemporaryDirectory
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
import os


def run():
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{server.server_port}/'
    try:
        with TemporaryDirectory() as tmp, sync_playwright() as p:
            browser = p.chromium.launch(headless=True, executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), args=['--no-sandbox'])
            page = browser.new_page(accept_downloads=True)
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('dialog', lambda d: d.accept())
            page.goto(url)
            page.evaluate("""() => { const s=CasaModel.defaults();s.groups.forEach(g=>{g.value=0;g.fundingSource='own';});
              s.constructionMode='global';s.groups[6].value=100000;s.groups[6].fundingSource='financed';s.groups[8].value=20000;
              Object.assign(s,{cash:200000,income:10000,essential:6000,monthlySavings:3000,currentApartment:300000,largerApartment:500000});
              s.housing=Housing.defaults(s);s.housing.startDate='2027-01-01';
              for (const key of ['rentBuild','buyThenBuild']) Object.assign(s.housing.paths[key].second,{entry:20000,months:420,buildMonths:3,cet:11});
              s.housing.paths.buyThenBuild.first.entry=60000;
              CasaModel.persist(localStorage,CasaModel.validate(s)); }""")
            page.reload()
            page.get_by_role('button', name='2 · Orçamento').click()
            assert page.locator('#categories select[data-key="fundingSource"]').count() == 11
            page.locator('#group-furniture > summary').click()
            source = '#group-furniture select[data-key="fundingSource"]'
            assert page.locator(source+' option').all_text_contents() == ['Financiado', 'Recursos Próprios']
            assert not page.locator(source).evaluate('(el)=>el.multiple')
            page.get_by_role('button', name='3 · Cenários').click()
            assert page.locator('#home-second-entry').input_value() == '20000'
            assert page.locator('#home-second-credit').input_value() == '80000'
            assert page.locator('#home-second-credit').evaluate('(el)=>el.readOnly')
            assert page.get_by_text('Recalcular entrada e crédito automaticamente', exact=True).count() == 0
            def change(selector, value):
                page.locator(selector).fill(str(value)); page.locator(selector).press('Tab')
            change('#home-second-entry', 30000)
            assert page.locator('#home-second-credit').input_value() == '70000'
            change('#home-second-entry', -1)
            assert not page.locator('#home-second-entry').evaluate('(el)=>el.checkValidity()')
            assert page.evaluate('state.housing.paths.rentBuild.second.entry') == 30000
            change('#home-second-entry', 100001)
            assert not page.locator('#home-second-entry').evaluate('(el)=>el.checkValidity()')
            assert page.evaluate('state.housing.paths.rentBuild.second.entry') == 30000
            change('#home-second-entry', 30000)
            page.get_by_role('button', name='2 · Orçamento').click()
            page.locator(source).select_option('financed')
            page.get_by_role('button', name='3 · Cenários').click()
            assert page.locator('#home-second-credit').input_value() == '90000'
            page.get_by_role('button', name='2 · Orçamento').click()
            change('#group-furniture input[data-item="-1"][data-key="value"]', 25000)
            page.get_by_role('button', name='3 · Cenários').click()
            assert page.locator('#home-second-credit').input_value() == '95000'
            change('#home-second-entry', 125000)
            assert page.locator('#home-second-credit').input_value() == '0'
            change('#home-second-entry', 30000)
            page.reload(); page.get_by_role('button', name='3 · Cenários').click()
            assert page.locator('#home-second-entry').input_value() == '30000'
            assert page.locator('#home-second-credit').input_value() == '95000'
            with page.expect_download() as download:
                page.get_by_role('button', name='Exportar dados JSON', exact=True).click()
            file = Path(tmp)/'backup.json'; download.value.save_as(file)
            data = json.loads(file.read_text())
            assert data['state']['groups'][8]['fundingSource'] == 'financed'
            assert data['state']['housing']['paths']['rentBuild']['second']['entry'] == 30000
            change('#home-second-entry', 10000)
            page.locator('#import').set_input_files(file)
            page.wait_for_function('state.housing.paths.rentBuild.second.entry === 30000')
            assert page.locator('#home-second-credit').input_value() == '95000'
            page.locator('#housingPath').select_option('buyThenBuild')
            assert page.locator('#home-second-credit').evaluate('(el)=>el.readOnly')
            assert not page.locator('#home-first-credit').evaluate('(el)=>el.readOnly')
            assert page.locator('#home-second-credit').input_value() == '105000'
            page.locator('#housingPath').select_option('buyLarger')
            assert not page.locator('#home-second-credit').evaluate('(el)=>el.readOnly')
            change('#home-second-credit', 350000)
            assert page.locator('#home-second-entry').input_value() == '150000'
            assert not errors, errors
            browser.close()
            print('PASS: 11 seletores exclusivos, entrada manual, crédito somente leitura, recálculo por classificação/valor/entrada, limites e zero, persistência, backup/importação e apartamentos editáveis.')
    finally:
        server.shutdown(); server.server_close()

if __name__ == '__main__':
    run()
