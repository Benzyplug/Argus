/**
 * File: chat.js
 * Description: AI-powered chat assistant with multi-model support for OSINT analysis
 * Author: ẞ€ÑZ¥
 *
 * This command provides access to various AI models for OSINT analysis, research
 * assistance, data interpretation, and investigative support. Integrates with
 * multiple AI providers to offer comprehensive intelligence analysis capabilities.
 *
 * Features:
 * - Multi-model AI support (GPT, Claude, Gemini, etc.)
 * - Conversation context management
 * - OSINT-specific analysis prompts
 * - Code generation for automation
 * - Data analysis and interpretation
 * - Report generation assistance
 * - Investigation planning support
 *
 * Supported Models:
 * - OpenAI GPT-4o, GPT-4o Mini
 * - Anthropic Claude 3.5/4 Sonnet
 * - Google Gemini Pro
 * - DeepSeek models
 * - Perplexity reasoning models
 *
 * Usage: /ai message:"Analyze this OSINT data" model:gpt-4o
 *        /ai message:"Generate Python script for data parsing" type:code
 */

const { SlashCommandBuilder, AttachmentBuilder, MessageFlags, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const axios = require('axios');
const { getSafeAxiosConfig } = require('../utils/ssrf');
const { sanitizeChatInput } = require('../utils/validation');
const { neutralizeMentions } = require('../utils/discord');
const { stylePayload } = require('../utils/embedBuilder');

const QWEN3_ASR_LANGUAGE_CODES = new Set([
    'zh', 'yue', 'en', 'ja', 'de', 'ko', 'ru', 'fr', 'pt', 'ar', 'it', 'es',
    'hi', 'id', 'th', 'tr', 'uk', 'vi', 'cs', 'da', 'fil', 'fi', 'is', 'ms',
    'no', 'pl', 'sv'
]);
const PHONE_CALL_LANGUAGE_CODE_PATTERN = /^[a-z]{2,3}-[A-Z]{2}$/;

// Store conversation contexts for users
const userConversations = new Map();
const MAX_CONVERSATIONS = 100;
const CONVERSATION_TTL = 30 * 60 * 1000; // 30 minutes

function pruneConversations() {
    const now = Date.now();
    for (const [key, conv] of userConversations) {
        if (conv.lastActivity && now - conv.lastActivity > CONVERSATION_TTL) {
            userConversations.delete(key);
        }
    }
    if (userConversations.size > MAX_CONVERSATIONS) {
        const oldest = [...userConversations.entries()]
            .sort((a, b) => (a[1].lastActivity || 0) - (b[1].lastActivity || 0));
        const toRemove = oldest.slice(0, userConversations.size - MAX_CONVERSATIONS);
        toRemove.forEach(([key]) => userConversations.delete(key));
    }
}

const pruneInterval = setInterval(pruneConversations, 5 * 60 * 1000);
pruneInterval.unref();

function buildAiModal(mode, userId) {
    const definitions = {
        ask: [
            ['prompt', 'Prompt', 'Ask a question or describe what you need…', TextInputStyle.Paragraph, true],
            ['model', 'Model', 'qwen3-vl-flash', TextInputStyle.Short, false],
            ['context', 'Context', 'general / osint / data / investigation / technical / report', TextInputStyle.Short, false]
        ],
        code: [
            ['request', 'Code request', 'Describe the code or automation you need…', TextInputStyle.Paragraph, true],
            ['language', 'Language', 'python / javascript / bash / powershell / sql', TextInputStyle.Short, false],
            ['model', 'Model', 'qwen3-coder-plus', TextInputStyle.Short, false],
            ['new-context', 'Fresh context', 'true or false', TextInputStyle.Short, false]
        ],
        analyze: [
            ['data', 'Data', 'Paste the findings or data to analyze…', TextInputStyle.Paragraph, true],
            ['analysis-type', 'Analysis type', 'summary / pattern / threat / link / timeline / risk', TextInputStyle.Short, false]
        ],
        transcribe: [
            ['audio-url', 'Audio asset', '1min.ai asset path / URL…', TextInputStyle.Short, true],
            ['stt-model', 'Speech model', 'qwen3-asr-flash / phone_call', TextInputStyle.Short, false],
            ['language', 'Language', 'en, en-US, etc. Leave blank for auto-detection.', TextInputStyle.Short, false],
            ['enable-itn', 'Inverse text normalization', 'true or false', TextInputStyle.Short, false]
        ]
    };

    const modal = new ModalBuilder()
        .setCustomId('argus:ai-modal:' + userId + ':' + mode)
        .setTitle(('AI • ' + mode).slice(0, 45));

    const inputs = (definitions[mode] || []).map(([name, label, placeholder, style, required]) =>
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('ai_' + name)
                .setLabel(label)
                .setPlaceholder(placeholder)
                .setStyle(style)
                .setRequired(required)
                .setMaxLength(4000)
        )
    );

    modal.addComponents(inputs);
    return modal;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ai')
        .setDescription('AI analysis, research, coding and transcription')
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('Choose what you want Argus AI to do')
                .setRequired(true)
                .addChoices(
                    { name: 'Ask', value: 'ask' },
                    { name: 'Code', value: 'code' },
                    { name: 'Analyze', value: 'analyze' },
                    { name: 'Transcribe', value: 'transcribe' },
                    { name: 'Reset Context', value: 'reset' }
                )),

    /**
     * Execute the AI chat command
     * @param {CommandInteraction} interaction - Discord interaction object
     */
    async execute(interaction) {
        const isModal = interaction.isModalSubmit?.();
        const subcommand = isModal
            ? String(interaction.customId || '').split(':')[2]
            : interaction.options.getString('mode');
        const userId = interaction.user.id;

        // The slash command chooses the operation. The actual input is collected
        // in a native Discord modal so the command menu stays clean.
        if (!isModal && subcommand !== 'reset') {
            await interaction.showModal(buildAiModal(subcommand, userId));
            return;
        }

        await interaction.deferReply();

        // Initialize user conversations if not exists
        if (!userConversations.has(userId)) {
            const convMap = new Map();
            convMap.lastActivity = Date.now();
            userConversations.set(userId, convMap);
        } else {
            userConversations.get(userId).lastActivity = Date.now();
        }

        console.log(`🤖 [CHAT] Processing ${subcommand} request for user: ${userId}`);

        // Validate API key
        const apiKey = process.env.AI_API_KEY;
        if (!apiKey) {
            return interaction.editReply({
                content: '❌ **Configuration Error**\n' +
                        'AI API key is not configured. Please contact the administrator.\n\n' +
                        '**Setup Instructions:**\n' +
                        '1. Get API key from your AI service provider\n' +
                        '2. Add AI_API_KEY to environment variables',
                flags: MessageFlags.Ephemeral
            });
        }

        try {
            let response;

            switch (subcommand) {
                case 'ask':
                    response = await handleChatRequest(interaction, userId, apiKey);
                    break;
                case 'code':
                    response = await handleCodeRequest(interaction, userId, apiKey);
                    break;
                case 'analyze':
                    response = await handleAnalysisRequest(interaction, userId, apiKey);
                    break;
                case 'transcribe':
                    response = await handleSpeechToTextRequest(interaction, apiKey);
                    break;
                case 'reset':
                    response = await handleResetRequest(interaction, userId);
                    break;
                default:
                    throw new Error('Invalid subcommand');
            }

            // Neutralize Discord mentions in the reply content before sending
            if (response && typeof response.content === 'string') {
                response.content = neutralizeMentions(response.content);
            }

            await interaction.editReply(response);

            console.log(`✅ [CHAT] Successfully processed ${subcommand} request`);

        } catch (error) {
            console.error('Chat error:', { status: error.response?.status, message: error.message });
            await handleChatError(interaction, error, subcommand);
        }
    },

    async handleInteraction(interaction) {
        const id = interaction.customId || '';
        if (!id.startsWith('argus:ai-modal:')) return false;

        const parts = id.split(':');
        const userId = parts[1];
        const mode = parts[2];

        if (interaction.user.id !== userId) {
            await interaction.reply({ content: '❌ This input form belongs to another user.', flags: MessageFlags.Ephemeral });
            return true;
        }

        const values = new Map();
        const fields = ['prompt', 'model', 'context', 'request', 'language', 'new-context', 'data', 'analysis-type', 'audio-url', 'stt-model', 'enable-itn'];
        for (const name of fields) {
            try {
                const value = interaction.fields.getTextInputValue('ai_' + name);
                if (value !== '') values.set(name, value);
            } catch {}
        }

        const options = {
            getSubcommand: () => mode,
            getString: name => values.get(name) ?? null,
            getBoolean: name => {
                const value = values.get(name);
                return value === undefined ? null : /^(true|1|yes|y|on)$/i.test(value);
            }
        };

        const originalReply = interaction.reply.bind(interaction);
        const originalEditReply = interaction.editReply.bind(interaction);
        const originalFollowUp = interaction.followUp.bind(interaction);
        const execution = new Proxy(interaction, {
            get(target, property, receiver) {
                if (property === 'commandName') return 'ai';
                if (property === 'options') return options;
                if (property === 'reply') return payload => originalReply(stylePayload(payload, { interaction, client: interaction.client, commandName: 'ai' }));
                if (property === 'editReply') return payload => originalEditReply(stylePayload(payload, { interaction, client: interaction.client, commandName: 'ai' }));
                if (property === 'followUp') return payload => originalFollowUp(stylePayload(payload, { interaction, client: interaction.client, commandName: 'ai' }));
                return Reflect.get(target, property, receiver);
            }
        });

        await module.exports.execute(execution);
        return true;
    },

    shutdown() { clearInterval(pruneInterval); }
};

/**
 * Handle chat/ask requests
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {string} userId - User ID
 * @param {string} apiKey - AI API key
 * @returns {Promise<Object>} Response object
 */
async function handleChatRequest(interaction, userId, apiKey) {
    const message = interaction.options.getString('message');
    const model = interaction.options.getString('model') || 'qwen3-vl-flash';
    const context = interaction.options.getString('context') || 'general';

    // Sanitize message using chat-friendly sanitizer (preserves brackets/parens)
    const cleanMessage = sanitizeChatInput(message);

    // Get or create conversation
    const conversations = userConversations.get(userId);
    let conversationId = conversations.get(`chat_${model}`);

    if (!conversationId) {
        conversationId = await createConversation('UNIFY_CHAT_WITH_AI', model, apiKey, context);
        conversations.set(`chat_${model}`, conversationId);
    }

    // Add context-specific system prompt
    const contextualMessage = addContextToMessage(cleanMessage, context);

    // Send message to AI
    const aiResponse = await sendAIRequest('UNIFY_CHAT_WITH_AI', model, conversationId, contextualMessage, apiKey);

    return formatAIResponse(aiResponse, model, 'Chat Response');
}

/**
 * Handle code generation requests
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {string} userId - User ID
 * @param {string} apiKey - AI API key
 * @returns {Promise<Object>} Response object
 */
async function handleCodeRequest(interaction, userId, apiKey) {
    const request = interaction.options.getString('request');
    const language = interaction.options.getString('language') || 'python';
    const model = interaction.options.getString('model') || 'qwen3-coder-plus';
    const newContext = interaction.options.getBoolean('new-context') ?? false;

    // Get or create code conversation
    const conversations = userConversations.get(userId);
    let conversationId = conversations.get('code_context');

    if (!conversationId || newContext) {
        conversationId = await createConversation('CODE_GENERATOR', model, apiKey, 'code');
        conversations.set('code_context', conversationId);
    }

    // Format code request with OSINT context
    const codePrompt = formatCodeRequest(request, language);

    // Send to AI
    const aiResponse = await sendAIRequest('CODE_GENERATOR', model, conversationId, codePrompt, apiKey);

    return formatAIResponse(aiResponse, model, 'Code Generation', true);
}

/**
 * Handle analysis requests
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {string} userId - User ID
 * @param {string} apiKey - AI API key
 * @returns {Promise<Object>} Response object
 */
async function handleAnalysisRequest(interaction, userId, apiKey) {
    const data = interaction.options.getString('data');
    const analysisType = interaction.options.getString('analysis-type') || 'summary';

    const model = 'qwen3-vl-flash'; // Stable unified-chat model used by Argus

    // Get or create analysis conversation
    const conversations = userConversations.get(userId);
    let conversationId = conversations.get('analysis_context');

    if (!conversationId) {
        conversationId = await createConversation('UNIFY_CHAT_WITH_AI', model, apiKey, 'analysis');
        conversations.set('analysis_context', conversationId);
    }

    // Format analysis request
    const analysisPrompt = formatAnalysisRequest(data, analysisType);

    // Send to AI
    const aiResponse = await sendAIRequest('UNIFY_CHAT_WITH_AI', model, conversationId, analysisPrompt, apiKey);

    return formatAIResponse(aiResponse, model, 'OSINT Analysis');
}

/**
 * Handle speech-to-text requests using Qwen3 ASR Flash
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {string} apiKey - AI API key
 * @returns {Promise<Object>} Response object
 */
async function handleSpeechToTextRequest(interaction, apiKey) {
    const audioUrl = interaction.options.getString('audio-url');
    const sttModel = interaction.options.getString('stt-model') || 'qwen3-asr-flash';
    const language = interaction.options.getString('language');
    const enableItn = interaction.options.getBoolean('enable-itn') ?? false;

    const cleanAudioUrl = audioUrl.trim();
    const rawLanguage = language ? language.trim() : '';

    if (sttModel === 'phone_call') {
        if (!rawLanguage) {
            return {
                content: '❌ **Missing Language Code**\n' +
                        'Phone Call transcription requires `language` (example: `en-US`, `vi-VN`, `zh-CN`).'
            };
        }

        if (!PHONE_CALL_LANGUAGE_CODE_PATTERN.test(rawLanguage)) {
            return {
                content: '❌ **Invalid Phone Call Language Code**\n' +
                        `Provided: \`${neutralizeMentions(rawLanguage)}\`\n` +
                        'Use a BCP-47 style code like `en-US`, `en-GB`, `vi-VN`, or `zh-CN`.'
            };
        }

        const aiResponse = await phoneCallSpeechToText(cleanAudioUrl, apiKey, rawLanguage);
        return formatAIResponse(aiResponse, 'phone_call', 'Phone Call Speech to Text');
    }

    const normalizedLanguage = rawLanguage ? rawLanguage.toLowerCase() : undefined;
    if (normalizedLanguage && !QWEN3_ASR_LANGUAGE_CODES.has(normalizedLanguage)) {
        return {
            content: '❌ **Invalid Qwen3 Language Code**\n' +
                    `Provided: \`${neutralizeMentions(normalizedLanguage)}\`\n` +
                    'Use a supported code like `en`, `zh`, `yue`, `ja`, `de`, `fr`, or leave blank for auto-detection.'
        };
    }

    const aiResponse = await qwen3AsrFlashSpeechToText(cleanAudioUrl, apiKey, {
        language: normalizedLanguage,
        enableItn
    });
    return formatAIResponse(aiResponse, 'qwen3-asr-flash', 'Speech to Text');
}

/**
 * Handle context reset requests
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Response object
 */
async function handleResetRequest(interaction, userId) {
    const resetType = interaction.options.getString('model') || 'all';
    const conversations = userConversations.get(userId);

    let resetCount = 0;
    let resetLabel = resetType;

    if (resetType === 'all') {
        resetCount = conversations.size;
        conversations.clear();
    } else {
        if (resetType === 'chat') {
            const chatKeys = Array.from(conversations.keys()).filter(key => key.startsWith('chat_'));
            for (const key of chatKeys) {
                conversations.delete(key);
            }
            resetCount = chatKeys.length;
            resetLabel = 'Chat contexts';
        } else if (resetType === 'code') {
            if (conversations.delete('code_context')) resetCount = 1;
            resetLabel = 'Code context';
        } else if (resetType === 'analysis') {
            if (conversations.delete('analysis_context')) resetCount = 1;
            resetLabel = 'Analysis context';
        }
    }

    return {
        content: `✅ **Context Reset Complete**\n` +
                `🗑️ **Cleared:** ${resetCount} conversation context(s)\n` +
                `🎯 **Type:** ${resetType === 'all' ? 'All contexts' : resetLabel}\n\n` +
                `Your next AI interaction will start with a fresh context.`
    };
}

/**
 * Create new AI conversation
 * @param {string} type - Conversation type
 * @param {string} model - AI model
 * @param {string} apiKey - API key
 * @param {string} context - Context type
 * @returns {Promise<string>} Conversation ID
 */
async function createConversation(type, model, apiKey, context) {
    const contextTitles = {
        'osint': 'OSINT Investigation Assistant',
        'data': 'Data Analysis Assistant',
        'investigation': 'Investigation Planning Assistant',
        'technical': 'Technical Analysis Assistant',
        'report': 'Report Writing Assistant',
        'code': 'OSINT Code Generation',
        'analysis': 'OSINT Data Analysis',
        'general': 'General OSINT Assistant'
    };

    const response = await axios.post(
        'https://api.1min.ai/api/conversations',
        {
            title: contextTitles[context] || 'Argus',
            type: type === 'CHAT_WITH_AI' ? 'UNIFY_CHAT_WITH_AI' : type,
            model: model
        },
        {
            ...getSafeAxiosConfig(),
            headers: {
                'API-KEY': apiKey,
                'Content-Type': 'application/json'
            },
            timeout: 15000,
            maxContentLength: 10 * 1024 * 1024,
            maxBodyLength: 10 * 1024 * 1024
        }
    );

    return response.data?.conversation?.uuid || response.data?.uuid;
}

/**
 * Send request to AI API
 * @param {string} type - Request type
 * @param {string} model - AI model
 * @param {string} conversationId - Conversation ID
 * @param {string} prompt - User prompt
 * @param {string} apiKey - API key
 * @returns {Promise<Object>} AI response
 */
async function sendAIRequest(type, model, conversationId, prompt, apiKey) {
    const isUnifiedChat = type === 'UNIFY_CHAT_WITH_AI' || type === 'CHAT_WITH_AI';
    const endpoint = isUnifiedChat
        ? 'https://api.1min.ai/api/chat-with-ai'
        : 'https://api.1min.ai/api/features';

    const promptObject = {
        prompt: prompt
    };
    if (conversationId) {
        promptObject.conversationId = conversationId;
    }

    const payload = isUnifiedChat
        ? {
            type: 'UNIFY_CHAT_WITH_AI',
            model: model,
            promptObject
        }
        : {
            type: type,
            model: model,
            conversationId: conversationId,
            promptObject: {
                prompt: prompt,
                webSearch: false
            }
        };

    const response = await axios.post(
        endpoint,
        payload,
        {
            ...getSafeAxiosConfig(),
            headers: {
                'API-KEY': apiKey,
                'Content-Type': 'application/json'
            },
            timeout: 60000, // 60 second timeout for AI processing
            maxContentLength: 10 * 1024 * 1024,
            maxBodyLength: 10 * 1024 * 1024
        }
    );

    return response.data;
}

/**
 * Transcribe audio with Qwen3 ASR Flash via 1min.ai AI Feature API
 * Docs: https://docs.1min.ai/docs/api/ai-for-audio/speech-to-text/qwen3-asr-flash
 * @param {string} audioUrl - Asset path returned by 1min.ai Asset API
 * @param {string} apiKey - AI API key
 * @param {Object} options - Optional settings
 * @param {string} [options.language] - Language code (e.g. en, zh, yue)
 * @param {boolean} [options.enableItn=false] - Enable inverse text normalization
 * @returns {Promise<Object>} AI response
 */
async function qwen3AsrFlashSpeechToText(audioUrl, apiKey, options = {}) {
    if (!audioUrl || typeof audioUrl !== 'string') {
        throw new Error('audioUrl is required for qwen3-asr-flash transcription');
    }

    const promptObject = {
        audioUrl: audioUrl,
        enable_itn: options.enableItn ?? false
    };

    if (options.language) {
        promptObject.language = options.language;
    }

    const response = await axios.post(
        'https://api.1min.ai/api/features',
        {
            type: 'SPEECH_TO_TEXT',
            model: 'qwen3-asr-flash',
            promptObject
        },
        {
            ...getSafeAxiosConfig(),
            headers: {
                'API-KEY': apiKey,
                'Content-Type': 'application/json'
            },
            timeout: 120000,
            maxContentLength: 10 * 1024 * 1024,
            maxBodyLength: 10 * 1024 * 1024
        }
    );

    return response.data;
}

/**
 * Transcribe phone call audio via 1min.ai Phone Call model
 * Docs: https://docs.1min.ai/docs/api/ai-for-audio/speech-to-text/phone-call-speech-to-text
 * @param {string} audioUrl - Asset path returned by 1min.ai Asset API
 * @param {string} apiKey - AI API key
 * @param {string} language - Language code (e.g. en-US, vi-VN)
 * @returns {Promise<Object>} AI response
 */
async function phoneCallSpeechToText(audioUrl, apiKey, language) {
    if (!audioUrl || typeof audioUrl !== 'string') {
        throw new Error('audioUrl is required for phone_call transcription');
    }
    if (!language || typeof language !== 'string') {
        throw new Error('language is required for phone_call transcription');
    }

    const response = await axios.post(
        'https://api.1min.ai/api/features',
        {
            type: 'SPEECH_TO_TEXT',
            model: 'phone_call',
            promptObject: {
                audioUrl,
                language
            }
        },
        {
            ...getSafeAxiosConfig(),
            headers: {
                'API-KEY': apiKey,
                'Content-Type': 'application/json'
            },
            timeout: 120000,
            maxContentLength: 10 * 1024 * 1024,
            maxBodyLength: 10 * 1024 * 1024
        }
    );

    return response.data;
}

/**
 * Add context-specific prompting to user message
 * @param {string} message - User message
 * @param {string} context - Context type
 * @returns {string} Enhanced message with context
 */
function addContextToMessage(message, context) {
    const contextPrompts = {
        'osint': 'As an OSINT analysis expert, please help with: ',
        'data': 'As a data analysis specialist, please analyze: ',
        'investigation': 'As an investigation planning expert, please advise on: ',
        'technical': 'As a technical analysis expert, please examine: ',
        'report': 'As a professional report writer, please help create: ',
        'general': ''
    };

    const contextPrompt = contextPrompts[context] || '';
    return contextPrompt + message;
}

/**
 * Format code generation request with OSINT context
 * @param {string} request - Code request
 * @param {string} language - Programming language
 * @returns {string} Formatted prompt
 */
function formatCodeRequest(request, language) {
    return `Please generate ${language} code for the following OSINT/investigation task: ${request}

Requirements:
- Include comprehensive comments explaining each section
- Add error handling and validation
- Make the code modular and reusable
- Include usage examples
- Consider OSINT best practices and data privacy
- Add appropriate logging for investigation trails

If this involves data processing, please include data validation and sanitization.`;
}

/**
 * Format analysis request with OSINT context
 * @param {string} data - Data to analyze
 * @param {string} analysisType - Type of analysis
 * @returns {string} Formatted prompt
 */
function formatAnalysisRequest(data, analysisType) {
    const analysisPrompts = {
        'pattern': 'Please analyze the following data for patterns, anomalies, and connections',
        'threat': 'Please assess the threat level and security implications of the following information',
        'link': 'Please identify relationships, connections, and associations in the following data',
        'timeline': 'Please create a timeline analysis of the following events and data',
        'risk': 'Please perform a risk assessment of the following information',
        'summary': 'Please provide a comprehensive summary and key insights from the following data'
    };

    const analysisPrompt = analysisPrompts[analysisType] || 'Please analyze the following data';

    return `${analysisPrompt}:

${data}

Please provide:
1. Key findings and insights
2. Notable patterns or anomalies
3. Potential investigative leads
4. Risk assessment if applicable
5. Recommended next steps
6. Confidence level in findings

Format your response for an OSINT investigation context.`;
}

/**
 * Format AI response for Discord
 * @param {Object} aiResponse - Raw AI response
 * @param {string} model - Model used
 * @param {string} responseType - Type of response
 * @param {boolean} isCode - Whether response contains code
 * @returns {Object} Formatted Discord response
 */
function formatAIResponse(aiResponse, model, responseType, isCode = false) {
    // Extract response content
    let content;

    if (aiResponse.aiRecord?.aiRecordDetail?.resultObject) {
        const resultObject = aiResponse.aiRecord.aiRecordDetail.resultObject;

        if (Array.isArray(resultObject)) {
            content = resultObject.join('\n');
        } else if (typeof resultObject === 'object') {
            content = JSON.stringify(resultObject, null, 2);
        } else {
            content = resultObject.toString();
        }
    } else if (aiResponse.result?.response) {
        content = aiResponse.result.response;
    } else {
        content = JSON.stringify(aiResponse, null, 2);
    }

    // Remove provider-specific hidden-reasoning/artifact wrappers before Discord output.
    content = content.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
    content = content.replace(/<artifact[^>]*>/gi, '').replace(/<\/artifact>/gi, '').trim();

    // Neutralize Discord mentions in LLM content before embedding in response
    content = neutralizeMentions(content);

    // Create response object
    const response = {
        content: `🤖 **${responseType} from ${model}**\n\n`
    };

    // Handle long responses
    const maxLength = 1900; // Leave room for header

    if (content.length <= maxLength) {
        response.content += content;
    } else {
        // Create attachment for long responses
        const attachment = new AttachmentBuilder(
            Buffer.from(content, 'utf8'),
            { name: `ai_response_${responseType.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.${isCode ? 'py' : 'txt'}` }
        );

        response.content += `*Response too long for Discord message. See attached file.*\n\n`;
        response.content += `**Preview:**\n${content.substring(0, 500)}...`;
        response.files = [attachment];
    }

    return response;
}

/**
 * Handle chat command errors
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {Error} error - The error that occurred
 * @param {string} subcommand - Subcommand that failed
 */
async function handleChatError(interaction, error, subcommand) {
    let errorMessage = `❌ **AI ${subcommand.charAt(0).toUpperCase() + subcommand.slice(1)} Failed**\n\n`;

    if (error.response) {
        const status = error.response.status;

        switch (status) {
            case 401:
            case 403:
                errorMessage += '**🔑 Authentication Error**\n';
                errorMessage += 'Invalid API key or unauthorized access. Check configuration.';
                break;
            case 429:
                errorMessage += '**🚦 Rate Limit Exceeded**\n';
                errorMessage += 'AI API rate limit reached. Please wait before trying again.';
                break;
            case 500:
            case 502:
            case 503:
                errorMessage += '**🛠️ Service Unavailable**\n';
                errorMessage += 'AI service is temporarily unavailable. Please try again later.';
                break;
            default:
                errorMessage += `**🚨 API Error (${status})**\n`;
                const apiMessage = error.response?.data?.message ||
                    error.response?.data?.error ||
                    error.response?.data?.detail;
                errorMessage += apiMessage
                    ? neutralizeMentions(String(apiMessage)).slice(0, 800)
                    : 'An error occurred communicating with the AI service.';
        }

    } else if (error.code === 'ECONNABORTED') {
        errorMessage += '**⏱️ Timeout Error**\n';
        errorMessage += 'AI request timed out. The request may be too complex or service is slow.';
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        errorMessage += '**🌐 Network Error**\n';
        errorMessage += 'Cannot connect to AI service. Please check your internet connection.';
    } else {
        errorMessage += '**🚨 Unexpected Error**\n';
        errorMessage += 'An unexpected error occurred while processing your request.';
    }

    await interaction.editReply({
        content: errorMessage,
        flags: MessageFlags.Ephemeral
    });
}
