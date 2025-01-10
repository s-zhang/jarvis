function getCurrentWeather(location) {
    return "The weather in " + location + " is 72°F and sunny.";
}

async function webSearch(query) {
    const response = await fetch("/api/web-search?query=" + query);
    const webSearchResults = await response.text();
    return webSearchResults;
}

async function getUnreadMessages() {
    const response = await fetch("/api/gmail/unread-messages");
    const unreadMessages = await response.text();
    return unreadMessages;
}

async function listTodos() {
    const response = await fetch("/api/todos/list");
    const todos = await response.text();
    return todos;
}

async function invokeFunction(functionName, parameters) {
    parameters = JSON.parse(parameters);

    let stop_response = false;
    let result = "";
    if (functionName === "get_current_weather") {
        result = getCurrentWeather(parameters.location);
    } else if (functionName === "web_search") {
        result = await webSearch(parameters.query);
    } else if (functionName === "stop_response") {
        stop_response = true;
    } else if (functionName === "get_unread_messages") {
        result = await getUnreadMessages();
    } else if (functionName === "list_todos") {
        result = await listTodos();
    }

    return {
        stop_response,
        result
    }
}

const tools = [
/*    {
        "type": "function",
        "name": "get_current_weather",
        "description": "Get the current weather",
        "parameters": {
            "type": "object",
            "properties": {
                "location": {
                    "type": "string",
                    "description": "The city and state, e.g. San Francisco, CA",
                }
            },
            "required": ["location"],
        },
    },*/
    {
        type: "function",
        name: "stop_response",
        description: "Call this function whenever user says \"stop\", \"OK\", \"understood\", \"fine\" or something similar. Stops any ongoing response of the assistant"
    },
    {
        type: "function",
        name: "web_search",
        description: "Perform a web search",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Search keywords or phrase",
                },
            },
            required: ["query"],
        },
    },
    {
        type: "function",
        name: "get_unread_messages",
        description: "Get unread messages from Gmail",
    },
    {
        type: "function",
        name: "list_todos",
        description: "List my todos",
    },
]

export { tools, invokeFunction };
