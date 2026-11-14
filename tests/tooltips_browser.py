"""Ajuda dos cronogramas: conteúdo por coluna, acessibilidade e dados intactos."""
from browser_smoke import QuietHandler, ROOT
from functools import partial
from http.server import ThreadingHTTPServer
from threading import Thread
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import os


def seed(page, path='rentBuild'):
    page.evaluate("""path=>{const s=CasaModel.defaults();Object.assign(s,{cash:150000,income:14000,essential:8000,monthlySavings:3000,
      rent:1500,currentApartment:300000,largerApartment:500000});s.groups.forEach(g=>{g.value=0;g.fundingSource='own';});
      s.groups[6].value=120000;s.groups[6].fundingSource='financed';s.constructionMode='global';
      s.housing=Housing.defaults(s);s.housing.startDate='2027-01-01';s.housing.selectedPath=path;
      for(const p of Object.values(s.housing.paths)){if(p.first)Object.assign(p.first,{entry:60000,months:420,cet:12});Object.assign(p.second,{entry:20000,months:420,buildMonths:6,cet:12});}
      state=CasaModel.validate(s);render();show('scenarios');document.getElementById('constructionMovements').open=true;}""", path)


def financial_state(page):
    return page.evaluate("""()=>JSON.stringify({state,result:Housing.calculate(state),csv:FinancialEngine.csv(Housing.calculate(state).rows,Housing.columns),storage:{...localStorage}})""")


def run():
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT)))
    Thread(target=server.serve_forever,daemon=True).start()
    url=f'http://127.0.0.1:{server.server_port}/'
    checked=0
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox'])
            page=browser.new_page(viewport={'width':1280,'height':900});errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto(url)
            tip=page.locator('#scenario-column-tooltip')
            for path in ['rentBuild','buyThenBuild','buyThenUpgrade','buyLarger']:
                seed(page,path);before=financial_state(page)
                for mode in ['monthly','annual','all']:
                    if mode!='monthly':
                        for i in range(page.locator('.housing-timeline').count()):
                            page.locator('.housing-timeline').nth(i).locator(f'[data-timeline-action="{mode}"]').click()
                        if page.evaluate('Housing.calculate(state).hasConstruction'):
                            page.locator(f'#constructionTimeline [data-project-action="{mode}"]').click()
                    tables=page.locator('#housingTimelines table, #constructionTimeline table')
                    assert tables.locator('th').count()==tables.locator('th button.scenario-column-help').count()
                    assert 'Capacidade de poupança' not in tables.locator('thead').all_text_contents()
                    for button in tables.locator('th button').all():
                        label=button.get_attribute('aria-label')
                        button.hover();expect(tip).to_be_visible()
                        text=tip.inner_text();assert len(text)>80
                        assert button.get_attribute('aria-describedby')=='scenario-column-tooltip'
                        assert tip.get_attribute('role')=='tooltip'
                        rect=tip.bounding_box();assert rect['x']>=0 and rect['x']+rect['width']<=1280
                        assert rect['y']>=0 and rect['y']+rect['height']<=900
                        if 'Poupança pessoal possível' in label:
                            assert 'R$ 0' in text and 'transferências' in text
                            assert 'compras/custos' in text.lower()
                        if mode=='annual' and label in ['Saldo pessoal disponível','Saldo exclusivo da obra','Dívida desta etapa (não é caixa)','Dívida da obra (não é caixa)']:
                            assert 'último mês' in text and 'Não soma' in text or 'Não é a soma' in text
                        if mode=='annual' and label.startswith('Menor saldo'):
                            assert 'abertura' in text and 'Não é soma nem média' in text
                        page.mouse.move(1,1);expect(tip).to_be_hidden()
                        checked+=1
                assert financial_state(page)==before
            # Teclado: foco, Escape, Enter/espaço e saída do foco.
            seed(page)
            button=page.locator('#housingTimelines th button').first
            button.scroll_into_view_if_needed();button.focus();expect(tip).to_be_visible()
            page.keyboard.press('Escape');expect(tip).to_be_hidden()
            page.keyboard.press('Enter');expect(tip).to_be_visible()
            page.keyboard.press('Space');expect(tip).to_be_hidden()
            page.keyboard.press('Enter');expect(tip).to_be_visible()
            page.keyboard.press('Tab');expect(tip).to_be_visible() # próximo cabeçalho tem sua própria explicação
            page.locator('#housingPath').focus();expect(tip).to_be_hidden()
            # A impressão conserva os títulos mesmo com a regra geral que oculta botões.
            page.emulate_media(media='print');assert button.evaluate("el=>getComputedStyle(el).display")!='none';page.emulate_media(media='screen')
            mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
            phone=mobile.new_page();phone.on('pageerror',lambda e:errors.append(str(e)));phone.goto(url);seed(phone)
            before=financial_state(phone);phone_tip=phone.locator('#scenario-column-tooltip')
            for parent in ['#housingTimelines','#constructionTimeline']:
                buttons=phone.locator(parent+' th button')
                for button in buttons.all():
                    button.tap();expect(phone_tip).to_be_visible()
                    rect=phone_tip.bounding_box();assert rect['x']>=0 and rect['x']+rect['width']<=390
                    assert rect['y']>=0 and rect['y']+rect['height']<=844
                    assert phone_tip.evaluate('el=>getComputedStyle(el).fontSize')=='14px'
                    phone.locator('#housingSelectedTitle').tap();expect(phone_tip).to_be_hidden()
            assert financial_state(phone)==before
            phone.screenshot(path='/tmp/vecto-tooltips-mobile.png',full_page=True)
            assert not errors,errors
            mobile.close();browser.close()
            print(f'PASS: {checked} cabeçalhos verificados em quatro caminhos e três visões; mouse, saída do mouse, foco, Escape, Enter, espaço, toque em 390px, balões dentro da tela, impressão e dados/CSV intactos.')
    finally:
        server.shutdown();server.server_close()

if __name__=='__main__':
    run()
