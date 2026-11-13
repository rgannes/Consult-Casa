"""Correção 1: caixa pessoal e caixa exclusivo da obra, sem novos campos técnicos."""
from browser_smoke import QuietHandler, ROOT
from functools import partial
from http.server import ThreadingHTTPServer
from threading import Thread
from tempfile import TemporaryDirectory
from pathlib import Path
from playwright.sync_api import sync_playwright
import os
import csv


def run():
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{server.server_port}/'
    try:
        with TemporaryDirectory() as tmp, sync_playwright() as p:
            options = {'headless': True, 'args': ['--no-sandbox']}
            executable = os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium')
            if Path(executable).exists():
                options['executable_path'] = executable
            browser = p.chromium.launch(**options)
            page = browser.new_page(accept_downloads=True)
            errors, requests = [], []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('request', lambda r: requests.append(r.url))
            page.on('dialog', lambda d: d.accept())
            page.goto(url)
            page.evaluate("""() => {const s=CasaModel.defaults();Object.assign(s,{cash:100000,income:0,essential:0,monthlySavings:0,
              currentApartment:300000,largerApartment:500000,rent:0,months:420});
              s.groups.forEach(g=>g.value=0);s.constructionMode='global';s.groups[6].value=120000;
              s.housing=Housing.defaults(s);s.housing.selectedPath='rentBuild';s.housing.startDate='2027-01-01';
              Object.assign(s.housing.paths.rentBuild.second,{entry:30000,months:420,buildMonths:3,cet:0});
              s.groups[6].subitems=Array.from({length:3},(_,i)=>({id:`phase-${i}`,description:`Medição ${i+1}`,value:40000,
                source:'Proposta fictícia',referenceDate:'',status:'estimado',notes:'',includedInGroup:true,
                measurement:true,measurementValue:30000,phaseEnd:FinancialEngine.addMonths('2027-01-01',i),releaseDelayDays:0}));
              const g=s.budgetSchedule.groups[6];g.mode='manual';g.payments=[
              {id:'prof1',month:1,amount:90000,status:'confirmed',fixed:true,origin:'manual'},
              {id:'prof2',month:3,amount:30000,status:'confirmed',fixed:true,origin:'manual'}];
              CasaModel.persist(localStorage,CasaModel.validate(s));}""")
            page.reload()
            page.get_by_role('button', name='3 · Cenários').click()
            assert page.locator('#housingError').inner_text() == ''
            assert page.locator('#constructionMovements').is_visible()
            assert page.locator('#constructionMovements').get_attribute('open') is None
            assert page.locator('#housingTimelines table').is_visible()
            assert 'Fornecedores' not in page.locator('#housingTimelines thead').inner_text()
            assert 'Saldo pessoal disponível' in page.locator('#housingTimelines thead').inner_text()
            assert page.locator('#home-second-entry').input_value() == '30000'
            assert page.evaluate('Housing.calculate(state).rows[0].closingCash') == 70000
            assert page.evaluate('Housing.calculate(state).rows[0].constructionCash') == -30000
            assert 'caixa da obra fica insuficiente' in page.locator('#housingWarnings').inner_text()
            page.get_by_text('Ver movimentação financeira da obra', exact=True).click()
            assert page.locator('#constructionMovements').get_attribute('open') is not None
            assert page.locator('#constructionTimeline tbody tr').count() == 12
            assert page.locator('#constructionTimeline tr.negative').count() == 1
            assert 'Liberação / reembolso bancário' in page.locator('#constructionTimeline thead').inner_text()
            page.locator('#constructionTimeline button[data-project-action="all"]').click()
            assert page.locator('#constructionTimeline tbody tr').count() == 420
            page.locator('#constructionTimeline button[data-project-action="annual"]').click()
            assert page.locator('#constructionTimeline tbody tr').count() == 35
            assert page.locator('#constructionTimeline tr.negative').count() == 1
            # Navegar o caixa da obra não altera o pessoal nem reinicia saldos.
            assert page.evaluate('Housing.calculate(state).rows[0].closingCash') == 70000
            with page.expect_download() as downloaded:
                page.get_by_role('button', name='Baixar cronograma completo em CSV', exact=True).click()
            file = Path(tmp) / 'flow.csv'
            downloaded.value.save_as(file)
            with file.open(encoding='utf-8-sig') as f:
                rows = list(csv.DictReader(f, delimiter=';'))
            assert len(rows) == 420
            assert rows[0]['Saldo pessoal final'] == '70000,00'
            assert rows[0]['Saldo exclusivo da obra'] == '-30000,00'
            assert rows[0]['Transferência pessoal para obra'] == rows[0]['Aporte próprio recebido pela obra'] == '30000,00'
            assert rows[0]['Crédito de apartamento'] == '0,00'
            assert rows[0]['Liberação/reembolso recebido pela obra'] == '30000,00'
            page.locator('#home-second-entry').fill('50000')
            page.locator('#home-second-entry').press('Tab')
            assert page.evaluate('Housing.calculate(state).ledgers.personal.totals.transfers') == 50000
            assert page.locator('#constructionMovements').get_attribute('open') is not None
            page.reload()
            page.get_by_role('button', name='3 · Cenários').click()
            assert page.locator('#home-second-entry').input_value() == '50000'
            page.locator('#housingPath').select_option('buyLarger')
            assert not page.locator('#constructionMovements').is_visible()
            assert page.locator('#housingError').inner_text() == ''
            assert page.evaluate('Housing.calculate(state).ledgers.project.totals.bankFunding') == 0
            page.set_viewport_size({'width':390,'height':844})
            page.locator('#housingPath').select_option('rentBuild')
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
            assert not errors, errors
            assert all(request.startswith(url) for request in requests), requests
            browser.close()
            print('PASS: fluxo pessoal primeiro, obra expansível, déficit independente, aporte limitado, saldo bancário segregado, 420 meses, resumo anual/CSV conciliado, persistência, apartamentos e mobile.')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    run()
