import {
    RunnerStatus,
    Runner as IRunner,
    ActionReport,
    RunEvents,
    ActionType,
    ActionStatus,
} from '@webwisp/types'
import { Logger } from 'winston'
import EventEmitter from 'node:events'

import PageWrapper from '../browser/wrappers/page.wrapper'
import { MindService } from '../mind'
import Message from '../mind/domain/Message'
import config from './runner.config'

import TaskResult from './domain/TaskResult'
import { ErrorResult } from './domain/ErrorResult'
import ParsedResult from '../mind/domain/ParsedResult'
import CycleResult from './domain/CycleResult'

/**
 * The Runner class provides a high-level interface for interacting with runners.
 * @public
 */
export default class Runner extends EventEmitter implements IRunner {
    private readonly logger: Logger
    public status = RunnerStatus.PENDING
    public createdAt = new Date()
    public readonly actions: ActionReport[] = []

    constructor(
        public readonly id: number,
        public readonly name: string,
        public readonly config: {
            target: string
            prompt: string
        },
        private readonly page: PageWrapper,
        private readonly mind: MindService,

        logger: Logger
    ) {
        super()
        this.logger = logger.child({
            context: 'Runner',
            id,
        })
    }

    private cycles = {
        total: 0,
        failed: 0,
        format: 0,
    }

    private setStatus(status: RunnerStatus): void {
        this.status = status
        this.emit(RunEvents.STATUS_CHANGED, {
            status: this.status,
        })
    }

    private isPaused = false
    public pause(): void {
        this.isPaused = true
        this.emit('runner.paused')
    }
    public resume(): void {
        this.isPaused = false
        this.emit('runner.resumed')
    }

    public async run(): Promise<TaskResult> {
        this.logger.debug(`Starting task`, this.config)

        this.setStatus(RunnerStatus.RUNNING)

        while (
            this.cycles.total < config.cycles.max &&
            this.cycles.failed < config.cycles.failed
        ) {
            const cycleResult = await this.cycle()

            if (!cycleResult.success) {
                this.cycles.failed++
                this.logger.warn(`Cycle failed: ${cycleResult.error}`)
            } else {
                this.cycles.total++
                const action = cycleResult.action
                this.logger.debug(`Cycle ${this.cycles.total} completed`)

                if (action.type === ActionType.Done) {
                    this.setStatus(
                        action.arguments.status === 'success'
                            ? RunnerStatus.COMPLETED
                            : RunnerStatus.FAILED
                    )

                    return {
                        success: action.arguments.status === 'success',
                        message: action.arguments.reason as string,
                        value: action.arguments.value as string | undefined,
                    }
                }
            }

            if (this.isPaused) {
                this.setStatus(RunnerStatus.PAUSED)
                await new Promise((resolve) => {
                    this.once('runner.resumed', resolve)
                    this.once(RunEvents.RUNNER_DESTROYED, resolve)
                })

                if (this.status === RunnerStatus.PAUSED)
                    this.setStatus(RunnerStatus.RUNNING)
            }

            if (config.delay) await this.sleep(config.delay)
        }

        this.setStatus(RunnerStatus.FAILED)

        if (this.cycles.failed >= config.cycles.failed) {
            return {
                success: false,
                message: 'Failed too many times',
            }
        } else {
            return {
                success: false,
                message: 'Reached maximum cycles',
            }
        }
    }

    private async cycle(): Promise<CycleResult | ErrorResult> {
        const startedAt = Date.now()

        await this.page.waitToLoad()

        const screenshot = await this.page.screenshot()
        if (!screenshot)
            return {
                success: false,
                error: 'Failed to take screenshot',
            }

        const title = await this.page.title(),
            url = this.page.url
        if (!title || !url)
            return {
                success: false,
                error: 'Failed to get title or URL',
            }

        const messages = this.mind.transformer.makePrompt({
            user: {
                title,
                url,
                task: this.config.prompt,
                previous_actions: this.actions,
                screenshot,
            },
        })

        this.cycles.format = 0

        let result: ParsedResult | null = null
        while (this.cycles.format < config.cycles.format && !result) {
            const genResult = await this.formatCycle(messages)
            if (genResult.success) {
                result = genResult
            } else {
                this.cycles.format++
                this.logger.warn('Failed to format cycle, retrying...', {
                    cycle: {
                        current: this.cycles.format,
                        max: config.cycles.format,
                    },
                    error: genResult.error,
                })
            }
        }

        if (!result)
            return {
                success: false,
                error: 'Failed to format cycle too many times',
            }

        const status = await this.page.perform(result.action)
        if (status !== ActionStatus.Success) {
            this.cycles.failed++
        }

        result.action.status = status

        const report: ActionReport = {
            action: result.action,
            reasoning: result.reasoning,
            duration: Date.now() - startedAt,
        }

        this.actions.push(report)

        this.logger.info('Performed action', report)

        this.emit(RunEvents.CYCLE_COMPLETED, { report })

        return {
            success: true,
            action: result.action,
        }
    }

    private async formatCycle(
        messages: Message[]
    ): Promise<ParsedResult | ErrorResult> {
        const completion = await this.mind.model.generate(messages)
        if (!completion)
            return {
                success: false,
                error: 'No completion found',
            }

        this.logger.debug('Received completion', completion)

        return this.mind.parser.parse(completion)
    }

    private async sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms))
    }
}