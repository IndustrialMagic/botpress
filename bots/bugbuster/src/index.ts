import { Bot, BotSpecificClient, type BotProps } from '@botpress/sdk'
import type { z } from 'zod'
import { Github, Linear } from '.botpress'

const github = new Github()
const linear = new Linear()

type GITHUB_EVENT_TYPE = `github:${keyof typeof github.definition.events}`

type LINEAR_CHANNELS = keyof typeof linear.definition.channels
type LINEAR_CONVERSATION_TAG = `linear:${keyof typeof linear.definition.channels.issue.conversation.tags}`

const GITHUB_ISSUE_OPENED_TYPE = 'github:issueOpened' satisfies GITHUB_EVENT_TYPE
const LINEAR_ISSUE_CHANNEL = 'issue' satisfies LINEAR_CHANNELS
const LINEAR_CONVERSATION_TAG_ID = 'linear:id' satisfies LINEAR_CONVERSATION_TAG

const botProps = {
  integrations: [github, linear] satisfies [Github, Linear], // TODO: find workaround for this weird satisfies statement
  states: {},
  events: {},
} satisfies BotProps
const bot = new Bot(botProps)

bot.event(async ({ event, client: _client, ctx }) => {
  const client = _client as BotSpecificClient<typeof botProps>

  const { type, payload } = event
  if (type !== GITHUB_ISSUE_OPENED_TYPE) {
    return
  }

  const parseResult = github.definition.events.issueOpened.schema.safeParse(payload)
  if (!parseResult.success) {
    throw new Error(`Invalid payload: ${parseResult.error}`)
  }

  const { data: githubIssue } = parseResult

  console.info('Received GitHub issue', githubIssue)

  const {
    output: { issue },
  } = await client.callAction({
    type: 'linear:createIssue',
    input: {
      title: githubIssue.title,
      description: githubIssue.content ?? 'No content...',
      teamName: 'Cloud Services',
    },
  })

  const { conversation } = await client.getOrCreateConversation({
    channel: LINEAR_ISSUE_CHANNEL,
    tags: {
      [LINEAR_CONVERSATION_TAG_ID]: issue.id,
    },
    integrationName: 'linear',
  })

  const issueUrl = `https://github.com/${githubIssue.repositoryOwner}/${githubIssue.repositoryName}/issues/${githubIssue.number}`

  await client.createMessage({
    type: 'text',
    conversationId: conversation.id,
    userId: ctx.botId,
    tags: {},
    payload: {
      text: `Automatically created from GitHub issue: ${issueUrl}`,
    } satisfies z.infer<typeof linear.definition.channels.issue.messages.text.schema>,
  })
})

export default bot
