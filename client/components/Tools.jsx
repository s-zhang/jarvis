function getCurrentWeather(location) {
    return "The weather in " + location + " is 72°F and sunny.";
}

async function braveWebSearch(query) {
    const response = await fetch("/api/web-search?query=" + query);
    const webSearchResults = await response.json();
    return webSearchResults;
}

async function invokeFunction(functionName, parameters) {
    parameters = JSON.parse(parameters);
    if (functionName === "get_current_weather") {
        return getCurrentWeather(parameters.location);
    } else if (functionName === "web_search") {
        return await braveWebSearch(parameters.query);
    }
}

const tools = [
    {
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
]

export { tools, invokeFunction };
