const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('extract-links')
        .setDescription('Extract unique links from a webpage')
        .addStringOption(option => option.setName('url').setDescription('Full webpage URL').setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply();
        const raw = interaction.options.getString('url', true);
        let target;
        try {
            target = new URL(raw);
            if (!['http:', 'https:'].includes(target.protocol)) throw new Error('protocol');
        } catch {
            return interaction.editReply('❌ Please provide a valid HTTP or HTTPS URL.');
        }

        try {
            const { validateUrlNotInternal, getSafeAxiosConfig } = require('../utils/ssrf');
            await validateUrlNotInternal(target.href);
            const axios = require('axios');
            const cheerio = require('cheerio');
            const response = await axios.get(target.href, {
                timeout: 15000,
                maxContentLength: 5 * 1024 * 1024,
                maxBodyLength: 5 * 1024 * 1024,
                headers: { 'User-Agent': 'Argus/2.3 OSINT Link Extractor' },
                ...getSafeAxiosConfig()
            });
            const $ = cheerio.load(String(response.data || ''));
            const links = new Map();
            $('a[href]').each((_i, el) => {
                const href = $(el).attr('href');
                try {
                    const absolute = new URL(href, target.href);
                    if (!['http:', 'https:'].includes(absolute.protocol)) return;
                    if (!links.has(absolute.href)) links.set(absolute.href, $(el).text().trim() || '[No text]');
                } catch {}
            });
            if (!links.size) return interaction.editReply('🔎 No HTTP/HTTPS links were found on that page.');
            const body = [...links.entries()].map(([href, label], i) => `${i + 1}. ${label}\n   ${href}`).join('\n\n');
            const attachment = new AttachmentBuilder(Buffer.from(body, 'utf8'), { name: 'argus-links.txt' });
            return interaction.editReply({
                content: `🔗 **Link extraction complete**\nFound **${links.size}** unique links on \`${target.hostname}\`.`,
                files: [attachment]
            });
        } catch (error) {
            console.error('extract-links failed:', { message: error.message, status: error.response?.status });
            return interaction.editReply('❌ Link extraction failed. The site may be unreachable, blocked, or too large.');
        }
    }
};
