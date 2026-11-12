"""Integração do orçamento no navegador, com dados exclusivamente fictícios.
Executar com Playwright/Chromium já instalados: python tests/budget_browser.py
"""
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
            options = {'headless': True, 'args': ['--no-sandbox']}
            executable = os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium')
            if Path(executable).exists():
                options['executable_path'] = executable
            browser = p.chromium.launch(**options)
            page = browser.new_page(accept_downloads=True)
            errors, requests = [], []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('request', lambda r: requests.append(r.url))
            page.on('dialog', lambda dialog: dialog.accept())
            page.goto(url)
            page.evaluate("""() => { const s = CasaModel.defaults(); s.cash = 2000000;
                Object.assign(s.planning, {startDate:'2026-11-01',firstDate:'2026-11-01',principal:0,months:12,upfront:0,fees:0});
                CasaModel.persist(localStorage, s); }""")
            page.reload()

            def change(selector, value):
                page.locator(selector).fill(str(value))
                page.locator(selector).press('Tab')

            before = page.evaluate('FinancialPlanner.calculate(state).flow.totals.closingCash')
            page.get_by_role('button', name='2 · Orçamento').click()
            page.locator('#field-constructionMode').select_option('global')
            page.locator('#group-construction summary').click()
            change('#group-construction input[data-item="-1"][data-key="value"]', 900000)
            assert page.evaluate('FinancialPlanner.calculate(state).flow.totals.closingCash') == before - 150000
            page.get_by_role('button', name='3 · Cenários').click()
            page.locator('#budgetScheduleSettings > summary').click()
            assert page.locator('#budgetReconciliation tbody tr').count() == 11
            assert page.locator('#budgetReconciliation tr.negative').count() == 0
            page.locator('#payment-group-construction > summary').click()
            payment = page.evaluate('state.budgetSchedule.groups[6].payments[0]')
            page.locator('#payment-group-construction select[data-key="status"]').first.select_option('confirmed')
            assert page.locator('#payment-group-construction input[data-key="amount"]').first.is_disabled()
            change('#plan-projectStartMonth', 3)
            change('#plan-constructionDelay', 2)
            change('#schedule-landMonth', 2)
            change('#schedule-moveDate', '2028-01-10')
            protected = page.evaluate('(id) => state.budgetSchedule.groups[6].payments.find(p => p.id===id)', payment['id'])
            assert protected['amount'] == 75000 and protected['month'] == 1
            assert page.evaluate('BudgetScheduler.resolve(state).timeline.moveMonth') == 15

            page.get_by_role('button', name='4 · Gastos reais').click()
            page.locator('#category').select_option('construction')
            page.locator('#expensePaymentLink').select_option(payment['id'])
            page.locator('#date').fill('2026-11-10')
            page.locator('#description').fill('Pagamento parcial fictício')
            page.locator('#amount').fill('50000')
            page.get_by_role('button', name='Registrar', exact=True).click()
            assert page.evaluate('BudgetScheduler.resolve(state).totals.paid') == 50000
            assert page.evaluate('BudgetScheduler.resolve(state).totals.difference') == 0
            assert page.evaluate('FinancialPlanner.calculate(state).flow.totals.constructionPayments') == 900000
            page.locator('#expensePaymentLink').select_option(payment['id'])
            page.locator('#description').fill('Complemento fictício')
            page.locator('#amount').fill('25000')
            page.get_by_role('button', name='Registrar', exact=True).click()
            assert page.evaluate('BudgetScheduler.resolve(state).totals.paid') == 75000
            assert page.evaluate('FinancialPlanner.calculate(state).flow.totals.constructionPayments') == 900000
            assert page.locator('#expenses tr').count() == 2
            page.locator('#expenses select[data-expense-status="1"]').select_option('A pagar')
            assert page.evaluate('BudgetScheduler.resolve(state).totals.paid') == 50000
            page.locator('#expenses select[data-expense-status="1"]').select_option('Pago')
            assert page.evaluate('BudgetScheduler.resolve(state).totals.paid') == 75000

            with page.expect_download() as download:
                page.get_by_role('button', name='Exportar dados JSON', exact=True).click()
            backup = Path(tmp) / 'backup.json'
            download.value.save_as(backup)
            obj = json.loads(backup.read_text())
            assert len(obj['state']['budgetSchedule']['groups']) == 11
            assert all(e['paymentId'] == payment['id'] for e in obj['state']['expenses'])
            page.locator('#import').set_input_files(backup)
            page.wait_for_function("document.getElementById('storageMessage').textContent.includes('Arquivo validado')")
            page.reload()
            page.get_by_role('button', name='3 · Cenários').click()
            assert page.evaluate('BudgetScheduler.resolve(state).totals.paid') == 75000
            page.locator('#budgetScheduleSettings > summary').click()
            page.locator('#payment-group-studies > summary').click()
            page.locator('#payment-group-studies select[data-key="mode"]').select_option('manual')
            change('#payment-group-studies input[data-key="amount"]', 10000)
            assert page.locator('#budgetReconciliation tr.negative').count() == 1
            change('#payment-group-studies input[data-key="amount"]', 9000)
            page.locator('#payment-group-studies input[data-key="fixed"]').check()
            assert page.locator('#payment-group-studies input[data-key="amount"]').is_disabled()
            with page.expect_download() as schedule:
                page.get_by_role('button', name='Baixar cronograma do orçamento CSV').click()
            csv = Path(tmp) / 'budget.csv'
            schedule.value.save_as(csv)
            assert 'Construção da residência' in csv.read_text(encoding='utf-8-sig')
            assert not errors, errors
            assert all(request.startswith(url) for request in requests), requests
            browser.close()
            print('PASS: orçamento atualiza fluxo, 11 grupos reconciliados, datas/atraso, proteção de confirmados, vínculo parcial sem duplicidade, edição de situação, backup/importação, cronograma manual e CSV.')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    run()
