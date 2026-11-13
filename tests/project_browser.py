"""Datas, medições, financiamento, dois caixas e ajuda acessível com dados descartáveis."""
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
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT)))
    Thread(target=server.serve_forever,daemon=True).start()
    url=f'http://127.0.0.1:{server.server_port}/'
    try:
        with TemporaryDirectory() as tmp, sync_playwright() as p:
            browser=p.chromium.launch(headless=True,executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox'])
            page=browser.new_page(accept_downloads=True)
            errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('dialog',lambda d:d.accept())
            page.goto(url)
            page.evaluate("""()=>{const s=CasaModel.defaults();s.groups.forEach(g=>g.value=0);s.constructionMode='global';s.groups[6].value=100000;
              Object.assign(s,{cash:100000,income:10000,essential:6000,monthlySavings:3000,rent:1000,rentIncludedInExpenses:true});
              Object.assign(s.planning,{startDate:'2027-01-01',constructionMonths:4,constructionDelay:0});
              s.housing=Housing.defaults(s);Object.assign(s.housing.paths.rentBuild.second,{credit:80000,entry:null,months:420,buildMonths:4,cet:12,coveragePercent:80,releaseDelayDays:30});
              CasaModel.persist(localStorage,CasaModel.validate(s));}""")
            page.reload()
            page.get_by_role('button',name='2 · Orçamento').click()
            page.locator('#group-construction > summary').click()
            def change(selector,value):
                page.locator(selector).fill(str(value));page.locator(selector).press('Tab')
            for i,(name,date,end) in enumerate([('Primeira fase','2027-01-10','2027-01-31'),('Segunda fase','2027-03-10','2027-04-01')]):
                page.locator('#group-construction button[data-add-group]').click()
                prefix=f'#group-construction [data-item="{i}"]'
                change(prefix+'[data-key="description"]',name)
                change(prefix+'[data-key="value"]',50000)
                change(prefix+'[data-key="referenceDate"]','2026-10-01')
                change(prefix+'[data-key="paymentDate"]',date)
                change(prefix+'[data-key="phaseEnd"]',end)
                page.locator(prefix+'[data-key="measurement"]').check()
                change(prefix+'[data-key="measurementValue"]',50000)
            assert page.evaluate('CasaModel.budget(state).total')==100000
            assert page.evaluate('BudgetScheduler.resolve(state).totals.difference')==0
            page.get_by_role('button',name='3 · Cenários').click()
            assert page.locator('#housingError').inner_text()==''
            assert '2027-03-02' in page.locator('#projectFundingReport').inner_text()
            assert page.evaluate('Housing.calculate(state).stages[0].funding.finance.disbursed')==80000
            assert page.evaluate('Housing.calculate(state).rows[0].constructionCash')==-30000
            headers=page.locator('#housingTimelines th').all_text_contents()
            assert sum('Poupança pessoal possível' in h for h in headers)==1
            assert not any('Capacidade de poupança' in h for h in headers)
            help=page.locator('#housingTimelines th details').filter(has_text='Poupança pessoal possível').first
            help.locator('summary').focus();page.keyboard.press('Enter')
            assert help.get_attribute('open') is not None
            assert help.locator('p').is_visible()
            assert 'aportes' in help.locator('p').inner_text().lower()
            help.locator('summary').press('Enter')
            help.locator('summary').hover();assert help.locator('p').is_visible()
            page.locator('#constructionMovements > summary').click()
            assert page.locator('#constructionTimeline tr.negative').count()>0
            with page.expect_download() as download:
                page.get_by_role('button',name='Exportar dados JSON',exact=True).click()
            file=Path(tmp)/'backup.json';download.value.save_as(file)
            data=json.loads(file.read_text());assert data['state']['groups'][6]['subitems'][0]['paymentDate']=='2027-01-10'
            page.reload();page.get_by_role('button',name='3 · Cenários').click()
            assert page.evaluate('Housing.calculate(state).stages[0].funding.finance.disbursed')==80000
            page.set_viewport_size({'width':390,'height':844})
            help=page.locator('#housingTimelines th details').filter(has_text='Poupança pessoal possível').first
            help.locator('summary').click();assert help.get_attribute('open') is not None
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            assert '© VECTO Consultoria' in page.locator('footer').inner_text()
            page.screenshot(path='/tmp/vecto-project-mobile.png',full_page=True)
            assert not errors,errors
            browser.close()
            print('PASS: edição de fases/datas pela interface, medição após conclusão, financiamento limitado, caixa separado, uma coluna de poupança, ajuda por mouse/teclado/toque, backup, persistência e mobile.')
    finally:
        server.shutdown();server.server_close()

if __name__=='__main__':
    run()
