const TelegramBot = require('node-telegram-bot-api');
const admin = require('firebase-admin');
const express = require('express');

// Инициализация health-check сервера
const healthApp = express();
healthApp.get('/', (req, res) => {
  res.status(200).send('Bot is alive');
});

const HEALTH_CHECK_PORT = process.env.PORT || 3000;
healthApp.listen(HEALTH_CHECK_PORT, () => {
  console.log(`✅ Health check server running on port ${HEALTH_CHECK_PORT}`);
});

// Проверка переменных окружения
if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN не установлен в переменных окружения!');
  process.exit(1);
}

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error('❌ FIREBASE_SERVICE_ACCOUNT не установлен в переменных окружения!');
  process.exit(1);
}

// Инициализация Firebase
try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('✅ Firebase инициализирован');
} catch (error) {
  console.error('❌ Ошибка инициализации Firebase:', error);
  process.exit(1);
}

const db = admin.firestore();

// Инициализация бота
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
console.log('🤖 Бот инициализирован');

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

// Функции работы с растениями
function getPlantStage(height) {
  if (height >= PLANT_STAGES.BLOOMING.minHeight) return PLANT_STAGES.BLOOMING;
  if (height >= PLANT_STAGES.MATURE.minHeight) return PLANT_STAGES.MATURE;
  if (height >= PLANT_STAGES.YOUNG.minHeight) return PLANT_STAGES.YOUNG;
  if (height >= PLANT_STAGES.SPROUT.minHeight) return PLANT_STAGES.SPROUT;
  return PLANT_STAGES.SEED;
}

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

async function getUser(userId) {
  const userDoc = await db.collection('users').doc(userId.toString()).get();
  return userDoc.exists ? userDoc.data() : null;
}

async function updateUser(userId, data) {
  await db.collection('users').doc(userId.toString()).update(data);
}

// Модифицированные функции полива и подкормки
async function waterPlant(userId) {
  const user = await getUser(userId);
  if (!user) return { success: false, message: 'Пользователь не найден!' };

  const now = admin.firestore.Timestamp.now();
  const lastWatered = user.plant.lastWatered.toDate();
  const timeDiff = (now.toDate() - lastWatered) / (1000 * 60 * 60);

  if (timeDiff < 4) {
    const hoursLeft = Math.ceil(4 - timeDiff);
    return { 
      success: false, 
      message: `🚫 Растение уже полито! Следующий полив через ${hoursLeft} ч.` 
    };
  }

  const growth = Math.floor(Math.random() * 3) + 1;
  const newHeight = user.plant.height + growth;
  const newHealth = Math.min(100, user.plant.health + 10);

  try {
    await db.collection('users').doc(userId.toString()).update({
      'plant.height': newHeight,
      'plant.health': newHealth,
      'plant.lastWatered': now,
      'plant.waterCount': admin.firestore.FieldValue.increment(1),
      'totalGrowth': admin.firestore.FieldValue.increment(growth)
    });
    
    return { 
      success: true, 
      growth: growth, 
      newHeight: newHeight,
      newHealth: newHealth
    };
  } catch (error) {
    console.error('Water plant error:', error);
    return { success: false, message: 'Ошибка при обновлении данных' };
  }
}

async function feedPlant(userId) {
  const user = await getUser(userId);
  if (!user) return { success: false, message: 'Пользователь не найден!' };

  const now = admin.firestore.Timestamp.now();
  const lastFed = user.plant.lastFed.toDate();
  const timeDiff = (now.toDate() - lastFed) / (1000 * 60 * 60);

  if (timeDiff < 6) {
    const hoursLeft = Math.ceil(6 - timeDiff);
    return { 
      success: false, 
      message: `🚫 Растение сыто! Следующая подкормка через ${hoursLeft} ч.` 
    };
  }

  const growth = Math.floor(Math.random() * 4) + 2;
  const newHeight = user.plant.height + growth;
  const newHealth = Math.min(100, user.plant.health + 20);

  try {
    await db.collection('users').doc(userId.toString()).update({
      'plant.height': newHeight,
      'plant.health': newHealth,
      'plant.lastFed': now,
      'plant.feedCount': admin.firestore.FieldValue.increment(1),
      'totalGrowth': admin.firestore.FieldValue.increment(growth)
    });
    
    return { 
      success: true, 
      growth: growth, 
      newHeight: newHeight,
      newHealth: newHealth
    };
  } catch (error) {
    console.error('Feed plant error:', error);
    return { success: false, message: 'Ошибка при обновлении данных' };
  }
}

// Обработчики команд бота (остаются без изменений)
bot.onText(/\/start/, async (msg) => {
  // ... существующий код обработчика /start ...
});

bot.on('callback_query', async (query) => {
  // ... существующий код обработчика callback_query ...
});

// Механизм переподключения
let isBotRunning = false;

function startBot() {
  if (isBotRunning) return;
  
  try {
    bot.startPolling();
    isBotRunning = true;
    console.log('✅ Бот начал polling');
  } catch (error) {
    console.error('❌ Ошибка запуска бота:', error);
    setTimeout(startBot, 5000);
  }
}

// Обработчики завершения работы
process.on('SIGINT', () => {
  console.log('🛑 Получен SIGINT, останавливаю бота...');
  bot.stopPolling();
  process.exit();
});

process.on('SIGTERM', () => {
  console.log('🛑 Получен SIGTERM, останавливаю бота...');
  bot.stopPolling();
  process.exit();
});

// Запуск бота
startBot();

// Периодическая проверка здоровья растений
setInterval(async () => {
  try {
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
  } catch (error) {
    console.error('Ошибка при обновлении здоровья растений:', error);
  }
}, 12 * 60 * 60 * 1000);

// Обработчики ошибок
bot.on('polling_error', (error) => {
  console.error('❌ Polling error:', error);
  isBotRunning = false;
  setTimeout(startBot, 5000);
});

bot.on('error', (error) => {
  console.error('❌ Bot error:', error);
});

console.log('🚀 Бот успешно запущен!');
