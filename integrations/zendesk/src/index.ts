import actions from './actions'
import { getZendeskClient } from './client'

import { executeTicketAssigned } from './events/ticket-assigned'
import { executeTicketSolved } from './events/ticket-solved'
import type { TriggerPayload } from './misc/types'
import { register, unregister } from './setup'
import * as botpress from '.botpress'

export default new botpress.Integration({
  register,
  unregister,
  actions,
  channels: {
    ticket: {
      messages: {
        text: async ({ ...props }) => {
          const zendeskClient = getZendeskClient(props.ctx.configuration)

          const { user } = await props.client.getUser({ id: props.payload.userId })

          if (user.tags?.origin === 'zendesk') {
            console.log('===> Message from Bot')
            return
          }

          const ticketId = props.conversation!.tags['zendesk1:id']!
          const zendeskUserId = user.tags['zendesk1:id']!

          return await zendeskClient.createComment(ticketId, zendeskUserId, props.payload.text)
        },
      },
    },
  },
  handler: async ({ req, ctx, client }) => {
    const zendeskClient = getZendeskClient(ctx.configuration)

    if (!req.body) {
      console.warn('Handler received an empty body')
      return
    }
    const trigger = JSON.parse(req.body)

    const zendeskTrigger = trigger as TriggerPayload
    console.log('handler:', zendeskTrigger)

    switch (zendeskTrigger.type) {
      case 'NewMessage':
        const { conversation } = await client.getOrCreateConversation({
          channel: 'ticket',
          tags: {
            id: zendeskTrigger.ticketId,
          },
        })

        if (!zendeskTrigger.currentUser.external_id?.length) {
          const { user: newUser } = await client.getOrCreateUser({
            tags: {
              id: zendeskTrigger.currentUser.id,
              origin: 'zendesk',
              name: zendeskTrigger.currentUser.name,
              email: zendeskTrigger.currentUser.email,
              role: zendeskTrigger.currentUser.role,
            },
          })

          await zendeskClient.updateUser(zendeskTrigger.currentUser.id, {
            external_id: newUser.id,
          })
        }

        const { user } = await client.getOrCreateUser({
          tags: {
            id: zendeskTrigger.currentUser.id,
          },
        })

        const messageWithoutAuthor = zendeskTrigger.comment.split('\n').slice(3).join('\n')

        await client.createMessage({
          tags: { origin: 'zendesk' },
          type: 'text',
          userId: user.id,
          conversationId: conversation.id,
          payload: { text: messageWithoutAuthor, userId: zendeskTrigger.currentUser.external_id },
        })

        return

      case 'TicketAssigned':
        return await executeTicketAssigned({ zendeskTrigger, client })
      case 'TicketSolved':
        return await executeTicketSolved({ zendeskTrigger, client })

      default:
        console.warn('unsupported trigger type')
        break
    }
  },
})
