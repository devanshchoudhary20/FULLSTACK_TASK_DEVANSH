import React, { useEffect, useState, useCallback }  from 'react'
import mqtt from 'mqtt';

const TodoList = () => {
    const [newTask, setNewTask] = useState('');
    const [todos, setTodos] = useState([]);
    const [client, setClient] = useState(null);

    useEffect(() => {
        const mqttClient = mqtt.connect('ws://localhost:8888');
        setClient(mqttClient);

        mqttClient.on('connect', () => {
            console.log('MQTT Client connected');
            mqttClient.subscribe('todolist/updated');
            mqttClient.publish('todolist/list', JSON.stringify({ action: 'list' }));
        });
        
        mqttClient.on('message', (topic, message) => {
            const data = JSON.parse(message.toString());
            console.log('Received message:', topic, data);
            
            if (topic === 'todolist/updated') {
                if (data.action === 'list') {
                    setTodos(data.todos || []);
                } else {
                    setTodos(prevTodos => {
                        switch (data.action) {
                            case 'added':
                                return [...prevTodos, {id: data.id, task: data.task, completed: false}];
                            case 'removed':
                                return prevTodos.filter(todo => todo.id !== data.id);
                            case 'completed':
                                return prevTodos.map(todo => 
                                    todo.id === data.id ? {...todo, completed: true} : todo
                                );
                            case 'uncompleted':
                                return prevTodos.map(todo => 
                                    todo.id === data.id ? {...todo, completed: false} : todo
                                );
                            default:
                                return prevTodos;
                        }
                    });
                }
            }
        });

        return () => {
            mqttClient.end();
        };
    }, []);

    const addTodo = useCallback(() => {
        if (newTask.trim() !== '' && client) {
            client.publish('todolist/add', JSON.stringify({ task: newTask }));
            setNewTask('');
        }
    }, [client, newTask]);

    const completeTodo = useCallback((id) => {
        if (client) {
            client.publish('todolist/complete', JSON.stringify({ id }));
        }
    }, [client]);

    const deleteTodo = useCallback((id) => {
        if (client) {
            client.publish('todolist/remove', JSON.stringify({ id }));
        }
    }, [client]);

    const uncompleteTodo = useCallback((id) => {
        if (client) {
            client.publish('todolist/uncomplete', JSON.stringify({ id }));
        }
    }, [client]);

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8 bg-white rounded-lg shadow-md overflow-hidden">
                <div className="p-4 sm:p-6 md:p-8">
                    <div className="flex items-center mb-4">
                        <div className="w-12 h-12 mr-2 rounded-sm flex items-center justify-center">
                            <img src = './images/noteapp.png' className="w-full h-full" />
                        </div>
                        <h1 className="text-xl sm:text-2xl font-bold ">Note App</h1>
                    </div>
                    <div className="flex mb-4">
                        <input
                            type="text"
                            value={newTask}
                            onChange={(e) => setNewTask(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    addTodo();
                                }
                            }}
                            placeholder="New Note..."
                            className="flex-grow p-2 border border-gray-300 rounded-xl focus:outline-none text-sm sm:text-base mr-4 "
                        />
                        <button
                            onClick={addTodo}
                            className="px-4 py-2 bg-amber-800 text-white rounded-xl hover:bg-[#a36f3e] focus:outline-none text-sm  font-semibold"
                        >
                            <div className="flex items-center justify-center">
                                <div className="mr-2 text-amber-800 bg-white rounded-full w-5 h-5 flex items-center justify-center font-bold">
                                    <div>+</div>
                                </div>
                                Add

                            </div>
                        </button>
                    </div>
                    <h2 className="text-lg sm:text-xl font-semibold mb-4 text-start border-b-2 border-gray-300 pb-2">Notes</h2>
                    <div className="max-h-64 sm:max-h-96 overflow-y-auto pr-2 " style={{ scrollbarColor: '#b97d46 #f3f4f6' }}>
                        <ul className="space-y-2">
                            {todos.map((todo) => (
                                <li key={todo.id} className="p-2 sm:p-3 bg-gray-100 rounded-md flex flex-row items-start sm:items-center justify-between">
                                    <span className={`${todo.completed ? 'line-through text-gray-500' : ''} mb-2 sm:mb-0`}>
                                        {todo.task}
                                    </span>
                                    <div className="flex space-x-2 w-full sm:w-auto justify-end">
                                        {todo.completed ? (
                                            <button
                                                onClick={() => uncompleteTodo(todo.id)}
                                                className="text-xs sm:text-sm px-2 py-1 bg-amber-800 text-white rounded hover:bg-[#a36f3e] focus:outline-none"
                                            >
                                                Undo
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => completeTodo(todo.id)}
                                                className="text-xs sm:text-sm px-2 py-1 bg-amber-800 text-white rounded hover:bg-[#a36f3e] focus:outline-none"
                                            >
                                                Complete
                                            </button>
                                        )}
                                        <button
                                            onClick={() => deleteTodo(todo.id)}
                                            className="text-xs sm:text-sm px-2 py-1 bg-amber-800 text-white rounded hover:bg-[#a36f3e] focus:outline-none"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default TodoList