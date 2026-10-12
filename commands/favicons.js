const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const crypto = require('node:crypto');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('favicon')
        .setDescription('Extract and analyze a website favicon')
        .addStringOption(option => option.setName('url').setDescription('Website URL to analyze').setRequired(true))
        .addBooleanOption(option => option.setName('raw').setDescription('Attach raw favicon data').setRequired(false))
        .addBooleanOption(option => option.setName('verbose').setDescription('Show discovery details').setRequired(false))
        .addStringOption(option => option.setName('format').setDescription('Hash output format').setRequired(false)
            .addChoices({ name: 'Decimal', value: 'decimal' }, { name: 'Hexadecimal', value: 'hex' }, { name: 'Both', value: 'both' })),

    async execute(interaction) {
        await interaction.deferReply();
        const raw = interaction.options.getString('url', true);
        const includeRaw = interaction.options.getBoolean('raw') ?? false;
        const verbose = interaction.options.getBoolean('verbose') ?? false;
        const format = interaction.options.getString('format') || 'both';
        let target;
        try {
            target = new URL(raw);
            if (!['http:', 'https:'].includes(target.protocol)) throw new Error('protocol');
        } catch {
            return interaction.editReply('❌ Please provide a valid HTTP or HTTPS URL.');
        }

        try {
            const axios = require('axios');
            const cheerio = require('cheerio');
            const murmurhash = require('murmurhash');
            const { validateUrlNotInternal, getSafeAxiosConfig } = require('../utils/ssrf');
            await validateUrlNotInternal(target.href);
            const page = await axios.get(target.href, {
                timeout: 12000,
                maxContentLength: 3 * 1024 * 1024,
                headers: { 'User-Agent': 'Argus/2.3 Favicon Intelligence' },
                ...getSafeAxiosConfig()
            });
            const $ = cheerio.load(String(page.data || ''));
            const candidates = [];
            $('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').each((_i, el) => {
                const href = $(el).attr('href');
                if (href) { try { candidates.push(new URL(href, target.href).href); } catch {} }
            });
            candidates.push(new URL('/favicon.ico', target.origin).href);

            let faviconUrl = null, data = null, contentType = '';
            for (const candidate of [...new Set(candidates)]) {
                try {
                    await validateUrlNotInternal(candidate);
                    const res = await axios.get(candidate, {
                        responseType: 'arraybuffer', timeout: 10000,
                        maxContentLength: 5 * 1024 * 1024,
                        ...getSafeAxiosConfig()
                    });
                    const buf = Buffer.from(res.data);
                    const type = String(res.headers?.['content-type'] || '');
                    if (buf.length && (type.startsWith('image/') || candidate.endsWith('.ico'))) {
                        faviconUrl = candidate; data = buf; contentType = type || 'image/x-icon'; break;
                    }
                } catch {}
            }
            if (!data) return interaction.editReply('❌ No usable favicon could be found for that website.');

            const base64 = data.toString('base64');
            const shodan = murmurhash.v3(base64);
            const signedShodan = shodan > 0x7fffffff ? shodan - 0x100000000 : shodan;
            const md5 = crypto.createHash('md5').update(data).digest('hex');
            const sha256 = crypto.createHash('sha256').update(data).digest('hex');
            const shodanHex = (shodan >>> 0).toString(16).padStart(8, '0');
            const shodanText = format === 'decimal' ? String(signedShodan) : format === 'hex' ? `0x${shodanHex}` : `${signedShodan} (0x${shodanHex})`;
            let content = `🧿 **Favicon Intelligence**\n**Host:** \`${target.hostname}\`\n**Favicon:** <${faviconUrl}>\n**Shodan mmh3:** \`${shodanText}\`\n**MD5:** \`${md5}\`\n**SHA-256:** \`${sha256}\``;
            if (verbose) content += `\n**Type:** \`${contentType}\`\n**Size:** \`${data.length} bytes\`\n**Candidates checked:** \`${new Set(candidates).size}\``;
            const files = includeRaw ? [new AttachmentBuilder(data, { name: 'favicon.bin' })] : [];
            return interaction.editReply({ content, files });
        } catch (error) {
            console.error('favicon failed:', { message: error.message, status: error.response?.status });
            return interaction.editReply('❌ Favicon analysis failed. The site may be unreachable or blocking automated requests.');
        }
    }
};
