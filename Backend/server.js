const aedes = require('aedes')();
const mqtt = require('mqtt');
const net = require('net');
const ws = require('websocket-stream');
const http = require('http');
const Redis = require('ioredis');
const { MongoClient } = require('mongodb');

const REDIS_KEY = 'FULLSTACK_TASK_DEVANSH'; 
const MONGO_URI = 'mongodb+srv://assignment_user:HCgEj5zv8Hxwa4xO@test-cluster.6f94f5o.mongodb.net/';
const MONGO_DB = 'assignment';
const MONGO_COLLECTION = 'assignment_DEVANSH'; 

// Redis setup
const redis = new Redis({
  host: 'redis-12675.c212.ap-south-1-1.ec2.cloud.redislabs.com',
  port: 12675,
  username: 'default',
  password: 'dssYpBnYQrl01GbCGVhVq2e4dYvUrKJB'
});

// MongoDB setup
let mongoClient;
let mongoCollection;

async function connectToMongo() {
  mongoClient = new MongoClient(MONGO_URI);
  await mongoClient.connect();
  const db = mongoClient.db(MONGO_DB);
  mongoCollection = db.collection(MONGO_COLLECTION);
}

connectToMongo().catch(console.error);

// MQTT Broker over TCP
const mqttServer = net.createServer(aedes.handle);
const mqttPort = 1883;
mqttServer.listen(mqttPort, () => {
    console.log('MQTT broker listening on port', mqttPort);
});

// MQTT Broker over WebSocket
const httpServer = http.createServer();
const wsPort = 8888;
ws.createServer({ server: httpServer }, aedes.handle);
httpServer.listen(wsPort, () => {
    console.log('WebSocket MQTT server listening on port', wsPort);
});

// Aedes broker callbacks
aedes.on('client', (client) => {
    console.log('Client Connected to broker:', client.id);
});

aedes.on('clientDisconnect', (client) => {
    console.log('Client Disconnected from broker:', client.id);
});

// MQTT Client
const client = mqtt.connect('ws://localhost:8888');

client.on('connect', () => {
    console.log('MQTT Client connected');
    client.subscribe('todolist/add');
    client.subscribe('todolist/remove');
    client.subscribe('todolist/complete');
    client.subscribe('todolist/uncomplete'); 
    client.subscribe('todolist/list');
});

client.on('message', async (topic, message) => {
    const data = JSON.parse(message.toString());

    switch (topic) {
        case 'todolist/add':
            const newTodo = { id: Date.now().toString(), task: data.task, completed: false };
            todos = [newTodo, ...todos]; 
            await saveTodosToRedis();
            await loadTodos();
            publishTodoList();
            break;
        case 'todolist/remove':
            await redis.get(REDIS_KEY).then(async (cachedTodos) => {
                if (cachedTodos) {
                    let redisTodos = JSON.parse(cachedTodos);
                    redisTodos = redisTodos.filter(todo => todo.id !== data.id);
                    await redis.set(REDIS_KEY, JSON.stringify(redisTodos));
                }
            });
            await mongoCollection.deleteOne({ id: data.id });
            await loadTodos();
            publishTodoList();
            break;
        case 'todolist/complete':
            await redis.get(REDIS_KEY).then(async (cachedTodos) => {
                if (cachedTodos) {
                    let redisTodos = JSON.parse(cachedTodos);
                    redisTodos = redisTodos.map(todo => 
                        todo.id === data.id ? {...todo, completed: true} : todo
                    );
                    await redis.set(REDIS_KEY, JSON.stringify(redisTodos));
                }
            });
            await mongoCollection.updateOne(
                { id: data.id },
                { $set: { completed: true } }
            );
            await loadTodos();
            publishTodoList();
            break;
        case 'todolist/uncomplete':
            await redis.get(REDIS_KEY).then(async (cachedTodos) => {
                if (cachedTodos) {
                    let redisTodos = JSON.parse(cachedTodos);
                    redisTodos = redisTodos.map(todo => 
                        todo.id === data.id ? {...todo, completed: false} : todo
                    );
                    await redis.set(REDIS_KEY, JSON.stringify(redisTodos));
                }
            });
            await mongoCollection.updateOne(
                { id: data.id },
                { $set: { completed: false } }
            );
            await loadTodos();
            publishTodoList();
            break;
        case 'todolist/list':
            await loadTodos();
            client.publish('todolist/updated', JSON.stringify({ action: 'list', todos }));
            break;
    }
});

// Initialize todos array
let todos = [];

// Load todos from Redis on startup
redis.get('todos', (err, data) => {
    if (err) console.error('Error loading todos from Redis:', err);
    if (data) todos = JSON.parse(data);
});

// Function to save todos to Redis and handle overflow to MongoDB
const saveTodosToRedis = async () => {
    try {
        let redisTodos = await redis.get(REDIS_KEY);
        redisTodos = redisTodos ? JSON.parse(redisTodos) : [];
        
        // Add new todos to the beginning of Redis list
        redisTodos = [...todos, ...redisTodos];  
        
        // Check if we have 50 or more items
        if (redisTodos.length >= 50) {
            // Move all items to MongoDB
            await moveItemsToMongoDB(redisTodos);
            
            // Clear Redis
            await redis.del(REDIS_KEY);
            redisTodos = [];
        }
        
        // Save to Redis
        await redis.set(REDIS_KEY, JSON.stringify(redisTodos));
        
        console.log(`Saved ${redisTodos.length} items to Redis`);
    } catch (err) {
        console.error('Error saving todos:', err);
    }
};

// Function to move items to MongoDB
const moveItemsToMongoDB = async (items) => {
    try {
        if (!mongoCollection) {
            throw new Error('MongoDB connection not established');
        }
        await mongoCollection.insertMany(items);
        console.log(`Moved ${items.length} items to MongoDB`);
    } catch (err) {
        console.error('Error moving items to MongoDB:', err);
    }
};

// Load todos from both Redis and MongoDB
const loadTodos = async () => {
    try {
        todos = [];
        
        // Load from Redis first (newest items)
        let cachedTodos = await redis.get(REDIS_KEY);
        if (cachedTodos) {
            const redisTodos = JSON.parse(cachedTodos);
            todos = [...redisTodos];
        }

        // Load from MongoDB (older items)
        if (mongoCollection) {
            const mongoTodos = await mongoCollection.find().sort({ id: -1 }).toArray();
            todos = [...todos, ...mongoTodos];
        }

        console.log(`Loaded ${todos.length} todos in total`);
    } catch (err) {
        console.error('Error loading todos:', err);
    }
};

// Call loadTodos on startup
loadTodos();

// Publish updated todo list to all clients
const publishTodoList = () => {
    aedes.publish({
        topic: 'todolist/updated',
        payload: JSON.stringify({ action: 'list', todos }),
    });
};

// Error handling
client.on('error', (error) => {
    console.error('MQTT Client Error:', error);
});

aedes.on('error', (error) => {
    console.error('Aedes Broker Error:', error);
});