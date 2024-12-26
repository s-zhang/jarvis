function getCurrentWeather(location) {
    return "The weather in " + location + " is 72°F and sunny.";
}

export function invokeFunction(functionName, parameters) {
    if (functionName === "get_current_weather") {
        return getCurrentWeather(parameters.location);
    }
}

export default tools = [
    {
        "type": "function",
        "function": {
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
        }
    }
]