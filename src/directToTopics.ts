import { readFile, writeFile } from 'fs/promises';
import { Context, NarrowedContext, Telegraf } from 'telegraf';
import { Update, Message } from 'telegraf/types';


const usersToTopics = JSON.parse(await readFile('./usersToTopics.json', 'utf-8')) as Record<number, number>

export default function (bot: Telegraf<Context<Update>>, topicGroupId: number) {
    bot.on('message', async (ctx, next) => {
        if (ctx.chat.type === 'supergroup' && ctx.chat.id === topicGroupId) {
            // get user id based on topic id
            const topicId = ctx.message.message_thread_id
            if (!topicId) return next()
            const chatId = Object.entries(usersToTopics).find(([id, topic]) => topic === topicId)?.[0]
            if (!chatId) return next()
            try {
                await ctx.copyMessage(chatId)
            } catch (e) {
                console.log(e)
            }
        } else if (ctx.chat.type === 'private') {
            const topic = usersToTopics[ctx.message.from.id] ?? await setupNewTopic(ctx, topicGroupId)
            try {
            
            await ctx.copyMessage(topicGroupId, {
                message_thread_id: topic
            })
            } catch (e) {
                console.log(e)
            }
        }
        return next()
    })
}


async function setupNewTopic(ctx: NarrowedContext<Context<Update>, Update.MessageUpdate<Message>>, topicGroupId: number) {
    const topic = await ctx.telegram.createForumTopic(topicGroupId, `${ctx.message.from.username ? `@${ctx.message.from.username}` : ctx.message.from.first_name} [${ctx.message.from.id}]`)
    usersToTopics[ctx.message.from.id] = topic.message_thread_id
    await writeFile('./usersToTopics.json', JSON.stringify(usersToTopics, null, 2))

    const profilePic = await ctx.telegram.getUserProfilePhotos(ctx.message.from.id)
     if (profilePic) {
        ctx.telegram.sendPhoto(topicGroupId, profilePic.photos[0][0].file_id, {
            caption: `First name: ${ctx.message.from.first_name}\nLast name: ${ctx.message.from.last_name || "<i>unset</i>"}\nUsername: ${ctx.message.from.username ? `@${ctx.message.from.username}` : "<i>unset</i>"}\nID: <code>${ctx.message.from.id}</code>`,
            parse_mode: 'HTML',
            message_thread_id: topic.message_thread_id
        })
    } else {
        ctx.telegram.sendMessage(topicGroupId, `First name: ${ctx.message.from.first_name}\nLast name: ${ctx.message.from.last_name || "<i>unset</i>"}\nUsername: ${ctx.message.from.username ? `@${ctx.message.from.username}` : "<i>unset</i>"}\nID: <code>${ctx.message.from.id}</code>`, {
            parse_mode: 'HTML',
            message_thread_id: topic.message_thread_id
        })
    }
    return topic.message_thread_id
}
