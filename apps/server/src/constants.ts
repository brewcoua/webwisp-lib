export const Contexts = {
    AgentService: 'AgentService',
    RunsGateway: 'RunsGateway',
    BrowserService: 'BrowserService',
    ContextWrapper: 'ContextWrapper',
    PageWrapper: (id: number) => `Page#${id}`,
    Runner: (id: number) => `Runner#${id}`,
    MindModule: 'MindModule',
}
