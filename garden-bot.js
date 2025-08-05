const TelegramBot = require('8327094310:AAHv5qAx4mUJkIuL6USLdJPkqMGhr1AoiXg');
const admin = require('firebase-admin');

// Инициализация Firebase
const serviceAccount = require('./firebase-service-account.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// Инициализация бота
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// Константы игры
const PLANT_STAGES = {
  SEED: { name: 'Семечко', emoji: '🌱', minHeight: 0 },
  SPROUT: { name: 'Росток', emoji: '🌿', minHeight: 5 },
  YOUNG: { name: 'Молодое растение', emoji: '🪴', minHeight: 15 },
  MATURE: { name: 'Взрослое растение', emoji: '🌳', minHeight: 30 },
  BLOOMING: { name: 'Цветущее', emoji: '🌸', minHeight: 50 }
};

const PLANT_VARIETIES = [
  'Северное сияние', 'Золотой лист', 'Зеленый дракон', 'Лунная пыль',
  'Изумрудная мечта', 'Солнечный луч', 'Фиолетовый туман', 'Королевский сад',
  'Дикая природа', 'Мистический лес', 'Радужный цвет', 'Небесная высота'
];

// Основные кнопки
const mainKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [{ text: '🌱 Мое растение', callback_data: 'my_plant' }],
      [{ text: '💧 Полить', callback_data: 'water' }, { text: '🌿 Подкормить', callback_data: 'feed' }],
      [{ text: '🏆 Рейтинг чата', callback_data: 'leaderboard' }],
      [{ text: '🎯 Достижения', callback_data: 'achievements' }, { text: '❓ Помощь', callback_data: 'help' }]
    ]
  }
};

// Функция получения стадии растения
function getPlantStage(height) {
  if (height >= PLANT_STAGES.BLOOMING.minHeight) return PLANT_STAGES.BLOOMING;
  if (height >= PLANT_STAGES.MATURE.minHeight) return PLANT_STAGES.MATURE;
  if (height >= PLANT_STAGES.YOUNG.minHeight) return PLANT_STAGES.YOUNG;
  if (height >= PLANT_STAGES.SPROUT.minHeight) return PLANT_STAGES.SPROUT;
  return PLANT_STAGES.SEED;
}

// Функция создания нового пользователя
async function createUser(userId, username, chatId) {
  const variety = PLANT_VARIETIES[Math.floor(Math.random() * PLANT_VARIETIES.length)];
  const userData = {
    username: username || `Садовод${userId}`,
    joinDate: admin.firestore.Timestamp.now(),
    chatId: chatId,
    plant: {
      variety: variety,
      height: 1,
      health: 100,
      lastWatered: admin.firestore.Timestamp.now(),
      lastFed: admin.firestore.Timestamp.now(),
      plantedDate: admin.firestore.Timestamp.now(),
      waterCount: 0,
      feedCount: 0
    },
    totalGrowth: 0,
    achievements: []
  };

  await db.collection('users').doc(userId.toString()).set(userData);
  return userData;
}

// Функция получения пользователя
async function getUser(userId) {
  const userDoc = await db.collection('users').doc(userId.toString()).get();
  return userDoc.exists ? userDoc.data() : null;
}

// Функция обновления пользователя
async function updateUser(userId, data) {
  await db.collection('users').doc(userId.toString()).update(data);
}

// Функция полива растения
async function waterPlant(userId) {
  const user = await getUser(userId);
  if (!user) return { success: false, message: 'Пользователь не найден!' };

  const now = admin.firestore.Timestamp.now();
  const lastWatered = user.plant.lastWatered.toDate();
  const timeDiff = (now.toDate() - lastWatered) / (1000 * 60 * 60); // часы

  if (timeDiff < 4) {
    const hoursLeft = Math.ceil(4 - timeDiff);
    return { 
      success: false, 
      message: `🚫 Растение уже полито! Следующий полив через ${hoursLeft} ч.` 
    };
  }

  // Рост от полива
  const growth = Math.floor(Math.random() * 3) + 1; // 1-3 см
  const newHeight = user.plant.height + growth;
  const newHealth = Math.min(100, user.plant.health + 10);

  await updateUser(userId, {
    'plant.height': newHeight,
    'plant.health': newHealth,
    'plant.lastWatered': now,
    'plant.waterCount': user.plant.waterCount + 1,
    totalGrowth: user.totalGrowth + growth
  });

  return { 
    success: true, 
    growth: growth, 
    newHeight: newHeight,
    newHealth: newHealth
  };
}

// Функция подкормки растения
async function feedPlant(userId) {
  const user = await getUser(userId);
  if (!user) return { success: false, message: 'Пользователь не найден!' };

  const now = admin.firestore.Timestamp.now();
  const lastFed = user.plant.lastFed.toDate();
  const timeDiff = (now.toDate() - lastFed) / (1000 * 60 * 60); // часы

  if (timeDiff < 6) {
    const hoursLeft = Math.ceil(6 - timeDiff);
    return { 
      success: false, 
      message: `🚫 Растение сыто! Следующая подкормка через ${hoursLeft} ч.` 
    };
  }

  // Рост от подкормки
  const growth = Math.floor(Math.random() * 4) + 2; // 2-5 см
  const newHeight = user.plant.height + growth;
  const newHealth = Math.min(100, user.plant.health + 20);

  await updateUser(userId, {
    'plant.height': newHeight,
    'plant.health': newHealth,
    'plant.lastFed': now,
    'plant.feedCount': user.plant.feedCount + 1,
    totalGrowth: user.totalGrowth + growth
  });

  return { 
    success: true, 
    growth: growth, 
    newHeight: newHeight,
    newHealth: newHealth
  };
}

// Функция получения рейтинга чата
async function getChatLeaderboard(chatId) {
  const snapshot = await db.collection('users')
    .where('chatId', '==', chatId)
    .orderBy('plant.height', 'desc')
    .limit(10)
    .get();

  const leaderboard = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    leaderboard.push({
      username: data.username,
      variety: data.plant.variety,
      height: data.plant.height,
      stage: getPlantStage(data.plant.height)
    });
  });

  return leaderboard;
}

// Обработчик команды /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || msg.from.first_name;

  let user = await getUser(userId);
  
  if (!user) {
    user = await createUser(userId, username, chatId);
    const stage = getPlantStage(user.plant.height);
    
    bot.sendMessage(chatId, 
      `🌱 Добро пожаловать в виртуальный сад!\n\n` +
      `Вы получили семечко сорта "${user.plant.variety}"!\n` +
      `${stage.emoji} Текущая высота: ${user.plant.height} см\n\n` +
      `Ухаживайте за своим растением каждый день и соревнуйтесь с друзьями!`,
      mainKeyboard
    );
  } else {
    const stage = getPlantStage(user.plant.height);
    bot.sendMessage(chatId,
      `🌿 С возвращением в сад!\n\n` +
      `${stage.emoji} Ваш "${user.plant.variety}": ${user.plant.height} см\n` +
      `💚 Здоровье: ${user.plant.health}%`,
      mainKeyboard
    );
  }
});

// Обработчик callback запросов
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;

  let user = await getUser(userId);
  
  // Если пользователь не найден, предлагаем начать
  if (!user && data !== 'help') {
    bot.answerCallbackQuery(query.id, { text: 'Нажмите /start для начала игры!' });
    return;
  }

  switch (data) {
    case 'my_plant':
      const stage = getPlantStage(user.plant.height);
      const plantedDays = Math.floor((Date.now() - user.plant.plantedDate.toDate()) / (1000 * 60 * 60 * 24));
      
      bot.editMessageText(
        `🌿 Ваше растение: "${user.plant.variety}"\n\n` +
        `${stage.emoji} Стадия: ${stage.name}\n` +
        `📏 Высота: ${user.plant.height} см\n` +
        `💚 Здоровье: ${user.plant.health}%\n` +
        `📅 Дней с посадки: ${plantedDays}\n` +
        `💧 Поливов: ${user.plant.waterCount}\n` +
        `🌿 Подкормок: ${user.plant.feedCount}`,
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          reply_markup: {
            inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'back' }]]
          }
        }
      );
      break;

    case 'water':
      const waterResult = await waterPlant(userId);
      if (waterResult.success) {
        const newStage = getPlantStage(waterResult.newHeight);
        bot.answerCallbackQuery(query.id, { 
          text: `💧 Полив завершен! +${waterResult.growth} см`, 
          show_alert: true 
        });
        
        bot.editMessageText(
          `💧 Растение полито!\n\n` +
          `${newStage.emoji} "${user.plant.variety}" выросло на ${waterResult.growth} см\n` +
          `📏 Новая высота: ${waterResult.newHeight} см\n` +
          `💚 Здоровье: ${waterResult.newHealth}%`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            reply_markup: {
              inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'back' }]]
            }
          }
        );
      } else {
        bot.answerCallbackQuery(query.id, { text: waterResult.message, show_alert: true });
      }
      break;

    case 'feed':
      const feedResult = await feedPlant(userId);
      if (feedResult.success) {
        const newStage = getPlantStage(feedResult.newHeight);
        bot.answerCallbackQuery(query.id, { 
          text: `🌿 Подкормка завершена! +${feedResult.growth} см`, 
          show_alert: true 
        });
        
        bot.editMessageText(
          `🌿 Растение подкормлено!\n\n` +
          `${newStage.emoji} "${user.plant.variety}" выросло на ${feedResult.growth} см\n` +
          `📏 Новая высота: ${feedResult.newHeight} см\n` +
          `💚 Здоровье: ${feedResult.newHealth}%`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            reply_markup: {
              inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'back' }]]
            }
          }
        );
      } else {
        bot.answerCallbackQuery(query.id, { text: feedResult.message, show_alert: true });
      }
      break;

    case 'leaderboard':
      const leaderboard = await getChatLeaderboard(chatId);
      let leaderText = '🏆 Рейтинг чата:\n\n';
      
      if (leaderboard.length === 0) {
        leaderText += 'Пока никто не выращивает растения в этом чате.';
      } else {
        leaderboard.forEach((player, index) => {
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
          leaderText += `${medal} ${player.username}\n`;
          leaderText += `   ${player.stage.emoji} "${player.variety}" - ${player.height} см\n\n`;
        });
      }
      
      bot.editMessageText(leaderText, {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: {
          inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'back' }]]
        }
      });
      break;

    case 'achievements':
      bot.editMessageText(
        `🎯 Достижения:\n\n` +
        `🌱 Первый росток - посадить растение\n` +
        `💧 Заботливый садовод - 10 поливов\n` +
        `🌿 Мастер подкормки - 10 подкормок\n` +
        `📏 Высотка - растение выше 25 см\n` +
        `🌳 Гигант - растение выше 50 см\n` +
        `🏆 Чемпион чата - 1 место в рейтинге\n\n` +
        `Ваш прогресс:\n` +
        `💧 Поливов: ${user.plant.waterCount}\n` +
        `🌿 Подкормок: ${user.plant.feedCount}\n` +
        `📏 Максимальная высота: ${user.plant.height} см`,
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          reply_markup: {
            inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'back' }]]
          }
        }
      );
      break;

    case 'help':
      bot.editMessageText(
        `❓ Как играть:\n\n` +
        `🌱 Каждый игрок получает семечко случайного сорта\n` +
        `💧 Поливайте растение каждые 4 часа\n` +
        `🌿 Подкармливайте каждые 6 часов\n` +
        `📏 Растение растет и проходит стадии развития\n` +
        `🏆 Соревнуйтесь с друзьями за первое место\n\n` +
        `Стадии роста:\n` +
        `🌱 Семечко (0-4 см)\n` +
        `🌿 Росток (5-14 см)\n` +
        `🪴 Молодое (15-29 см)\n` +
        `🌳 Взрослое (30-49 см)\n` +
        `🌸 Цветущее (50+ см)`,
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          reply_markup: {
            inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'back' }]]
          }
        }
      );
      break;

    case 'back':
      const currentStage = getPlantStage(user.plant.height);
      bot.editMessageText(
        `🌿 Виртуальный сад\n\n` +
        `${currentStage.emoji} Ваш "${user.plant.variety}": ${user.plant.height} см\n` +
        `💚 Здоровье: ${user.plant.health}%\n\n` +
        `Выберите действие:`,
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          ...mainKeyboard
        }
      );
      break;
  }

  bot.answerCallbackQuery(query.id);
});

// Периодическое снижение здоровья (каждые 12 часов)
setInterval(async () => {
  const now = admin.firestore.Timestamp.now();
  const twelveHoursAgo = new Date(now.toDate().getTime() - 12 * 60 * 60 * 1000);
  
  const snapshot = await db.collection('users').get();
  
  snapshot.forEach(async (doc) => {
    const user = doc.data();
    const lastCare = Math.max(
      user.plant.lastWatered.toDate().getTime(),
      user.plant.lastFed.toDate().getTime()
    );
    
    if (lastCare < twelveHoursAgo.getTime() && user.plant.health > 20) {
      await updateUser(doc.id, {
        'plant.health': Math.max(20, user.plant.health - 10)
      });
    }
  });
}, 12 * 60 * 60 * 1000); // каждые 12 часов

console.log('🤖 Garden Bot запущен!');

// Обработка ошибок
bot.on('polling_error', (error) => {
  console.log('Polling error:', error);
});

process.on('unhandledRejection', (reason) => {
  console.log('Unhandled Rejection:', reason);
});

module.exports = bot;