import "dotenv/config"
import { Api, TelegramClient } from "telegram"
import { StringSession } from "telegram/sessions/index.js"
import { NewMessage, type NewMessageEvent } from "telegram/events/index.js"
import { Telegraf } from "telegraf"
import { Groups, Templates } from "@theJollyUnion/database"
import type { Direction } from "readline"
import type { Group, Template } from "@theJollyUnion/database/models"
import type { Message } from "telegraf/types"

const apiId = Number(process.env.API_ID)
const apiHash = process.env.API_HASH
const MainSessionString = process.env.MAIN_SESSION_STRING
const AuxSessionString = process.env.AUX_SESSION_STRING
const botToken = process.env.BOT_TOKEN
const telegramDMCAChatId = process.env.TELEGRAM_DMCA_CHAT_ID
const indexGroupId = process.env.INDEX_GROUP_ID

if (!apiId) throw new Error("API_ID not set")
if (!apiHash) throw new Error("API_HASH not set")
if (!MainSessionString) throw new Error("MAIN_SESSION_STRING not set")
if (!AuxSessionString) throw new Error("AUX_SESSION_STRING not set")
if (!botToken) throw new Error("BOT_TOKEN not set")
if (!telegramDMCAChatId) throw new Error("TELEGRAM_DMCA_CHAT_ID not set")
if (!indexGroupId) throw new Error("INDEX_GROUP_ID not set")

const mainSessionString = new StringSession(MainSessionString)
const mainClient = new TelegramClient(mainSessionString, apiId, apiHash, {})

const auxSessionString = new StringSession(AuxSessionString)
const auxClient = new TelegramClient(auxSessionString, apiId, apiHash, {})

const bot = new Telegraf(botToken)

await mainClient.connect()
await auxClient.connect()
const auxMe = await auxClient.getMe()

const messages: Api.Message[] = []

setInterval(async () => {
    try {
        await mainClient.connect()
        await auxClient.connect()
    } catch (e) {
        console.error(e)
    }
}, 1000 * 60 * 10)

auxClient.addEventHandler(async (update: NewMessageEvent) => {
    messages.push(update.message)
    if (update.chatId?.toString() !== telegramDMCAChatId) return

    const { rows: allGroups } = (await Groups.find()) as { rows: Group[] }

    for (let g = 0; g < allGroups.length; g++) {
        const group = allGroups[g]
        if (!update.message.message.includes(group.id)) continue
        if (!group.clean) continue

        await Groups.findOneAndUpdate({ id: group.id }, { clean: false })
        await publishGroup(group.template)

        break
    }
}, new NewMessage({}))

async function publishGroup(code: string) {
    const template = await Templates.findOne({ code })
    if (!template) throw new Error(`Template not found for ${code}`)
    const group = await Groups.findOne({ $and: [{ status: "ready" }, { clean: true }, { template: code }] })
    if (!group) throw new Error(`Group not found for ${code}`)

    await floodProtection("Prepare Group", () =>
        auxClient.invoke(
            new Api.channels.EditTitle({
                channel: "-100" + group.id,
                title: `${template.title} [${group.id}]`,
            })
        )
    )

    const botMessage = await bot.telegram.sendMessage(auxMe.id.toString(), createIndexMessage(template, group.inviteLink), { parse_mode: "HTML" })

    const receivedMessage = await getBotMessage(botMessage)
    if (!receivedMessage) throw new Error("Failed to receive message")
    await floodProtection("Publish Group", () =>
        mainClient.invoke(
            new Api.messages.EditMessage({
                peer: indexGroupId,
                id: template.indexMessage.id,
                message: receivedMessage.message,
                entities: receivedMessage.entities,
            })
        )
    )

    await bot.telegram.deleteMessage(auxMe.id.toString(), botMessage.message_id)
}

function getBotMessage(msg: Message.TextMessage): Promise<Api.Message | null> {
    return new Promise(async (resolve) => {
        for (let i = 0; i < 30; i++) {
            const message = messages.find((message) => {
                const sameDate = message.date === msg.date
                const sameFirstLine = msg.text.split("\n")[0] === message.message.split("\n")[0]
                return sameDate && sameFirstLine
            })
            if (message) return resolve(message)
            await new Promise((resolve) => setTimeout(resolve, 1000))
        }

        resolve(null)
    })
}

function createIndexMessage(template: Template, inviteLink: string) {
    const indexMessage = template.indexMessage
    const title = `<b><a href="${indexMessage.resourceURL}">${template.title}</a></b>`
    const overview = `<blockquote>${indexMessage.overview}</blockquote>`
    let authorLine: string | null = null
    if ("author" in indexMessage && indexMessage.author) {
        const author = indexMessage.author.url ? `<a href="${indexMessage.author.url}">${indexMessage.author.name}</a>` : indexMessage.author.name
        authorLine = `Support the author, ${author}, on <a href="${indexMessage.author.supportPlatformURL}">${indexMessage.author.supportPlatform}</a>`
    }
    return `${title}\n\n${overview}\n\n${authorLine ? authorLine + "\n" : ""}${indexMessage.callToAction} ${inviteLink}`
}

async function floodProtection<T extends () => Promise<unknown>>(taskName: string, task: T): Promise<Awaited<ReturnType<T>>> {
    try {
        return (await task()) as Awaited<ReturnType<T>>
    } catch (e) {
        if (typeof e === "object" && e && "seconds" in e && typeof e.seconds === "number") {
            let remaining = e.seconds
            let beginningOfLine = 0
            let interval = setInterval(async () => {
                remaining--
                await moveCursor(0 - beginningOfLine, 0)
                await clearLine(1)
                const message = `FLOOD_WAIT, waiting ${remaining} seconds for ${taskName}`
                beginningOfLine = message.length
                process.stdout.write(`FLOOD_WAIT, waiting ${remaining} seconds for ${taskName}`)
            }, 1000)
            await new Promise((resolve) => setTimeout(resolve, (e.seconds as number) * 1000))
            clearInterval(interval)
            console.log(`FLOOD_WAIT, waited ${e.seconds} seconds for ${taskName}`)
            return floodProtection(taskName, task)
        }
        throw e
    }
}

function moveCursor(x: number, y: number) {
    return new Promise((resolve) => {
        process.stdout.moveCursor(x, y, () => resolve(null))
    })
}

function clearLine(x: Direction) {
    return new Promise((resolve) => {
        process.stdout.clearLine(x, () => resolve(null))
    })
}
