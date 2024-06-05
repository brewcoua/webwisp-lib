import { Browser, BrowserContext, chromium, firefox, Page } from 'playwright'

import Logger from '@/logger'
import Service from '@/domain/Service'
import { getConfig } from '@/domain/Config'

export default class PlaywrightService extends Service {
    private browser!: Browser
    private context!: BrowserContext
    private pages: Page[] = []

    constructor() {
        super('playwright')
    }

    public async initialize(): Promise<void> {
        Logger.debug('Initializing Playwright service')
        const config = getConfig()

        switch (config.browser.type) {
            case 'chromium':
                this.browser = await chromium.launch(config.browser.options)
                break
            case 'firefox':
                this.browser = await firefox.launch(config.browser.options)
                break
        }

        this.context = await this.browser.newContext(config.browser.context)
    }

    public async destroy(): Promise<void> {
        for (const page of this.pages) {
            await page?.close()
        }
        await this.context?.close()
        await this.browser?.close()
    }

    public async make_page(url?: string): Promise<Page> {
        const page = await this.context.newPage()
        if (url) {
            await page.goto(url, {
                waitUntil: 'domcontentloaded',
            })
        }

        await page.setViewportSize(getConfig().browser.viewport)

        this.pages.push(page)

        return page
    }
}