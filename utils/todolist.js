import { flattenFilter } from './notion.js';
import { Client as Notion } from "@notionhq/client";

const databaseId = 'b66d6356c2a4470384b06d3970f68517';
const filter = {
  and: [
    {
      or: [
        {
          property: 'Priority',
          select: {
            equals: 'Today'
          }
        },
        {
          property: 'Priority',
          select: {
            equals: 'Tomorrow'
          }
        },
        {
          property: 'Priority',
          select: {
            equals: 'Day after'
          }
        },
        {
          property: 'Priority',
          select: {
            equals: 'This weekend'
          }
        },
        {
          property: 'Priority',
          select: {
            equals: 'Next weekend'
          }
        },
        {
          property: 'Priority',
          select: {
            equals: 'Next week'
          }
        },
        {
          property: 'Priority',
          select: {
            equals: '2 weeks'
          }
        },
        {
          and: [
            {
              property: 'Tag',
              multi_select: {
                does_not_contain: 'Holiday'
              }
            },
            {
              or: [
                {
                  property: 'Priority',
                  select: {
                    equals: '4 weeks'
                  }
                },
                {
                  property: 'Priority',
                  select: {
                    equals: '3 months'
                  }
                },
                {
                  property: 'Priority',
                  select: {
                    equals: 'More than 3 months'
                  }
                }
              ]
            }
          ]
        },
      ]
    },
    {
      or: [
        {
          property: 'Status',
          status: {
            equals: 'N'
          }
        },
        {
          property: 'Status',
          status: {
            equals: 'R'
          }
        },
        {
          property: 'Status',
          status: {
            equals: 'P'
          }
        }
      ]
    }
  ]
};

const schema = {
  type: "object",
  properties: {
    name: {
      type: "string",
      description: "name of the todo"
    },
    status: {
      type: "string",
      description: "status of the todo, One of 'N', 'P', 'C', 'D' for Not Started, In Progress, Cut, or Done."
    },
    priority: {
      type: "string",
      description: "priority of the todo, One of 'Today', 'Tomorrow', 'Day after', 'This weekend', 'Next weekend', 'Next week', '2 weeks', '4 weeks', '3 months', 'More than 3 months'"
    },
    project: {
      type: "array",
      items: {
        type: "string",
        description: "project of the todo"
      }
    },
    dueDate: {
      type: "string",
      description: "due date (and possibly time) of the todo, string in YYYY-MM-DD or YYYY-MM-DD HH:MM format"
    },
    tag: {
      type: "array",
      items: {
        type: "string",
        description: "tag of the todo"
      }
    }
  }
}

const schemaWithId = {
  type: "object",
  properties: {
    id: { type: "string", description: "id of the todo" },
    ...schema.properties
  },
  required: ["id"]
}

function todoToNotionProperties(todo) {
  const properties = {};

  if (todo.status) {
    properties.Status = {
      status: {
        name: todo.status
      }
    }
  }
  if (todo.priority) {
    properties.Priority = {
      select: {
        name: todo.priority
      }
    }
  }
  if (todo.project) {
    properties.Project = {
      multi_select: todo.project.map(p => ({ name: p }))
    }
  }
  if (todo.name) {
    properties.Name = {
      title: [{ text: { content: todo.name } }]
    }
  }
  if (todo.dueDate) {
    properties['Due Date'] = {
      date: {
        start: todo.dueDate
      }
    }
  }
  if (todo.tag) {
    properties.Tag = {
      multi_select: todo.tag.map(t => ({ name: t }))
    }
  }

  return properties;
}

function notionPageToTodo(page) {
  return {
    id: page.id,
    priority: page.properties.Priority.select?.name,
    status: page.properties.Status.status?.name,
    project: page.properties.Project?.multi_select.map(project => project.name) || [],
    name: page.properties.Name.title[0]?.plain_text || null,
    dueDate: page.properties['Due Date'].date?.start || null,
    tag: page.properties.Tag.multi_select.map(tag => tag.name) || []
  };
}

class TodoList {
  constructor(notionApiKey) {
    this.notion = new Notion({ auth: notionApiKey });
  }

  async listTodos() {
    try {
      const response = await this.notion.databases.query({
        database_id: databaseId,
        filter: flattenFilter(filter),
      });

      return response.results.map(notionPageToTodo);
    } catch (error) {
      throw new Error(`Failed to query Notion database: ${error.message}`);
    }
  }

  async updateTodo(todoId, todo) {
    const properties = todoToNotionProperties(todo);
    const page = await this.notion.pages.update({
      page_id: todoId,
      properties
    });
    return notionPageToTodo(page);
  }

  async createTodo(todo) {
    if (!todo.status) {
      todo.status = 'N';
    }
    if (!todo.priority) {
      todo.priority = 'Today';
    }
    const properties = todoToNotionProperties(todo);
    const page = await this.notion.pages.create({
      parent: { database_id: databaseId },
      properties
    });
    return notionPageToTodo(page);
  }
}

export { TodoList, schema, schemaWithId };