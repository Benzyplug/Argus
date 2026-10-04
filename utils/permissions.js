const { PermissionFlagsBits } = require('discord.js');

const RESTRICTED_COMMANDS = {
    'nuclei-scan': PermissionFlagsBits.Administrator,
    'monitor': PermissionFlagsBits.ManageGuild,
    'image-ai': PermissionFlagsBits.ManageGuild,
    'jwt': PermissionFlagsBits.ManageGuild,
    'google-investigate': PermissionFlagsBits.ManageGuild,
    'sherlock': PermissionFlagsBits.ManageGuild,
    'maigret': PermissionFlagsBits.ManageGuild,
    'link-check': PermissionFlagsBits.ManageGuild,
    'doc-meta': PermissionFlagsBits.ManageGuild
};

function getAllowedRoles() {
    const roleIds = process.env.OSINT_ALLOWED_ROLES;
    return roleIds ? roleIds.split(',').map(id => id.trim()) : [];
}

function checkPermission(interaction) {
    const commandName = interaction.commandName;
    const requiredPerm = RESTRICTED_COMMANDS[commandName];
    const allowedRoles = getAllowedRoles();

    if (!interaction.guild) {
        return { allowed: false, reason: 'This command can only be used in a server.' };
    }

    // When OSINT_ALLOWED_ROLES is configured, every Argus command is role-gated.
    // Server administrators can still use Argus without the role.
    if (allowedRoles.length > 0) {
        const isAdministrator = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
        const hasAllowedRole = interaction.member?.roles?.cache?.some(role => allowedRoles.includes(role.id));
        if (!isAdministrator && !hasAllowedRole) {
            return { allowed: false, reason: 'You need the Argus OSINT role to use this command.' };
        }
    }

    // Extra permission gates still apply to sensitive commands.
    if (requiredPerm && !interaction.memberPermissions?.has(requiredPerm)) {
        const hasAllowedRole = allowedRoles.length > 0 &&
            interaction.member?.roles?.cache?.some(role => allowedRoles.includes(role.id));
        if (!hasAllowedRole) {
            return { allowed: false, reason: 'You do not have permission to use this command.' };
        }
    }

    return { allowed: true };
}

module.exports = { checkPermission, RESTRICTED_COMMANDS };
