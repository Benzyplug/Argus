const logger = require('./logger');
const UNAVAILABLE = new Set([10062, 40060, 50027]);

function isInteractionValid(interaction) {
  if (!interaction || typeof interaction !== 'object') return false;
  if (!interaction.id || !interaction.user) return false;
  if (interaction.replied || interaction.deferred) return true;
  if (interaction.createdTimestamp && Date.now() - interaction.createdTimestamp > 2800) return false;
  return true;
}

async function safeShowModal(interaction, modal) {
  if (!isInteractionValid(interaction) || interaction.replied || interaction.deferred) return false;
  try {
    await interaction.showModal(modal);
    return true;
  } catch (error) {
    if (UNAVAILABLE.has(error?.code)) {
      logger.warn({ code: error.code, customId: interaction.customId }, 'Interaction expired before modal');
      return false;
    }
    throw error;
  }
}

function withExpiredInteractionHandler(handler) {
  return async (...args) => {
    try { return await handler(...args); }
    catch (error) {
      if (UNAVAILABLE.has(error?.code)) {
        logger.warn({ code: error.code, handler: handler.name || 'anonymous' }, 'Expired interaction ignored');
        return null;
      }
      throw error;
    }
  };
}

module.exports = { isInteractionValid, safeShowModal, withExpiredInteractionHandler };
