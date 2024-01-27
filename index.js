import ollama from 'ollama';
import { ActivityType, Client, GatewayIntentBits, Partials } from 'discord.js';
import 'dotenv/config'

const BOT_TOKEN = process.env.BOT_TOKEN;
const MODEL_NAME = process.env.MODEL_NAME;
const previousMessageLimit = 6;
const stopIfGenerating = true;

const textCursorString = '▋';
const previousMessages = [];
let previousMessage = '';
let isGenerating = false;

function trimPreviousMessages() {
	if (previousMessages.length > previousMessageLimit) {
		previousMessages.shift();
	}
}

const client = new Client({
	intents: Object.values(GatewayIntentBits),
	partials: [Partials.Channel, Partials.Message, Partials.User, Partials.GuildMember, Partials.Reaction],
});

const messageUpdateInterval = 1000;

function updateMessage(messageObject, result, generating) {
	if (!result) return;

	// Add the text cursor to the end of the message if the bot is still generating
	let newMessage = result.trim() + (generating ? textCursorString : '');

	// If the message hasn't changed, don't update it
	if (previousMessage === newMessage) {
		return;
	}
	// Discord has a 2000 character limit
	if (newMessage.length > 2000) {
		newMessage = newMessage.substring(0, 2000);
	}
	// This should never happen, but Discord throws an error if you try to send an empty message
	if (newMessage.length === 0) {
		newMessage = '*No response*';
	}
	// Update the message with the new content
	messageObject.edit(newMessage);

	previousMessage = newMessage;

	// If the bot is done generating, add the message to the previous messages
	if (!generating) {
		previousMessages.push({ role: 'assistant', content: newMessage });
		trimPreviousMessages();
		isGenerating = false;
	}
}

async function streamResponse(messageObject, content) {
	const message = { role: 'user', content };
	previousMessages.push(message);
	trimPreviousMessages();

	const response = await ollama.chat({ model: MODEL_NAME, messages: previousMessages, stream: true });
	let result = '';
	const interval = setInterval(() => {
		updateMessage(messageObject, result, true);
	}, messageUpdateInterval);

	for await (const part of response) {
		if (!part.message || !part.message.content) continue;

		result += part.message.content;

		process.stdout.write(part.message.content);
	}

	clearInterval(interval);
	updateMessage(messageObject, result, false);
}

client.once('ready', () => {
    console.log('Bot is online!');
	client.user.setPresence({ 
		activities: [{ 
			name: 'llama.Warze.org', 
			type: ActivityType.Listening,
		}], 
		status: 'online' 
	});
});

client.on('messageCreate', async (message) => {
    // Ignore messages from other bots
    if (message.author.bot) return;

	// Ignore messages that start with #
	if (message.content.startsWith('#')) return;

	// Dont respond to messages if the bot is generating a response
	if (isGenerating && stopIfGenerating) return;

	isGenerating = true;
	const messageObject = await message.channel.send(textCursorString);
	previousMessage = textCursorString;
	await streamResponse(messageObject, message.content);
});

client.login(BOT_TOKEN);
