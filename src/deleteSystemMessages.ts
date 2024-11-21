import { Context, NarrowedContext, Telegraf } from 'telegraf';
import {message} from "telegraf/filters"
import { Update, Message } from 'telegraf/types';


export default function (bot: Telegraf<Context<Update>>) {
    bot.on(message("new_chat_members"), (ctx, next) => {
        ctx.deleteMessage()
        return next()
    })

    bot.on(message("left_chat_member"), (ctx, next) => {
        ctx.deleteMessage()
        return next()
    })

    bot.on(message("new_chat_title"), (ctx, next) => {
        ctx.deleteMessage()
        return next()
    })
}
