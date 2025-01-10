import express from 'express';
import session from 'express-session';
import grant from 'grant';
import https from 'https';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import 'dotenv/config';
import OpenAI from 'openai';
import initializeDatabase from './db.js';
import { initializeToken, saveToken, getToken, checkAndRefreshToken } from './auth.js';
import { google } from 'googleapis';
import { Client as Notion } from "@notionhq/client"
import { flattenFilter } from './utils/notion.js';

const key = fs.readFileSync('secrets/self-signed.key');
const cert = fs.readFileSync('secrets/self-signed.crt');
const app = express();
const port = process.env.PORT || 3000;
const openaiApiKey = process.env.OPENAI_API_KEY;
const perplexity = new OpenAI({
  apiKey: process.env.PERPLEXITY_API_KEY,
  baseURL: 'https://api.perplexity.ai'
});
const notion = new Notion({ auth: process.env.NOTION_API_KEY });

// Get command line arguments
const args = process.argv.slice(2);
const isProd = args.includes('--prod');
const origin = isProd 
  ? "https://pingshans-air.tail3d8f4.ts.net:3000"
  : "https://localhost:3000";

async function createServer() {
  const db = await initializeDatabase(isProd);

  const refreshInterval = 5 * 60 * 1000;
  // Set an interval to check the token every 5 minutes
  setInterval(() => checkAndRefreshToken(db, refreshInterval), refreshInterval);

  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'custom',
  });

  app.use(vite.middlewares);

  // Serve static files
  app.use(express.static('client/public'));

  // API route for token generation
  app.get('/token', async (req, res) => {
    try {
      const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-realtime-preview-2024-12-17",
          voice: "verse",
        }),
      });
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error('Token generation error:', error);
      res.status(500).json({ error: 'Failed to generate token' });
    }
  });

  app.get('/api/todos/list', async (req, res) => {
    try {
      const response = await notion.databases.query({
        database_id: 'b66d6356c2a4470384b06d3970f68517',
        filter: flattenFilter({
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
        })
      });
      // extract the page id and the following properties: 'Priority', 'Status', 'Project', 'Name', 'Due Date', 'Tag' for each page
      const todos = response.results.map(page => ({
        id: page.id,
        priority: page.properties.Priority.select?.name,
        status: page.properties.Status.status?.name,
        project: page.properties.Project?.multi_select.map(project => project.name) || [],
        name: page.properties.Name.title[0]?.plain_text || null,
        dueDate: page.properties['Due Date'].date?.start || null,
        tag: page.properties.Tag.multi_select.map(tag => tag.name) || []
      }));
      res.json(todos);
    } catch (error) {
      console.error('Error querying Notion database:', error);
      res.status(500).json({ error: 'Failed to query Notion database' });
    }
  });

  app.get('/api/gmail/unread-messages', async (req, res) => {
    try {
      const token = await getToken(db);
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials(token);
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      const response = await gmail.users.messages.list({
        userId: 'me',
        q: 'is:unread label:inbox',
        includeSpamTrash: false,
        maxResults: 20 // Limit to 20 messages
      });
      const messages = response.data.messages;
      
      // Get the From, To, CC, Bcc, Subject, Date, and Body of each message
      const messageDetails = await Promise.all(messages.map(async (message) => {
        const messageResponse = await gmail.users.messages.get({
          userId: 'me',
          id: message.id
        });
        const headers = messageResponse.data.payload.headers;
        const getHeader = (name) => headers.find(header => header.name === name)?.value || '';

        const from = getHeader('From');
        const to = getHeader('To');
        const cc = getHeader('Cc');
        const bcc = getHeader('Bcc');
        const subject = getHeader('Subject');
        const date = getHeader('Date');
        let body = '';
        const parts = messageResponse.data.payload.parts;
        if (parts) {
          const textPart = parts.find(part => part.mimeType === 'text/plain');
          if (textPart && textPart.body && textPart.body.data) {
            body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
          }
        }

        return {
          from,
          to,
          cc,
          bcc,
          subject,
          date,
          body
        };
      }));

      res.json(messageDetails);
    } catch (error) {
      console.error('Error listing Gmail threads:', error);
      res.status(500).json({ error: 'Failed to list Gmail threads' });
    }
  });

  // Use web-enabled query as web search
  app.get('/api/web-search', async (req, res) => {
    try {
      const userQuery = req.query.query;
      // Perform query
      const completion = await perplexity.chat.completions.create({
        model: "llama-3.1-sonar-small-128k-online",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that searches the web when necessary.",
          },
          {
            role: "user",
            content: `Search this on the web: ${userQuery}`,
          },
        ],
      });
      res.json(completion);
    } catch (error) {
      console.error('Search error:', error);
      res.status(500).json({ error: 'Failed to perform search' });
    }
  });

  const googleClientSecret = JSON.parse(fs.readFileSync(process.env.GOOGLE_CLIENT_SECRET_PATH));
  app
    .use(session({secret: 'grant', saveUninitialized: true, resave: false}))
    .use(grant.express({
      "defaults": {
        "origin": origin,
        "transport": "session"
      },
      "google": {
        "key": googleClientSecret.web.client_id,
        "secret": googleClientSecret.web.client_secret,
        "callback": "/google",
        "custom_params": {
          "access_type": "offline",
          "prompt": "consent"
        },
        "scope": [
          'https://www.googleapis.com/auth/gmail.readonly',
          'https://www.googleapis.com/auth/gmail.send'
        ]
      }
    }))
    .get('/google', async (req, res) => {
      const token = req.session.grant.response;
      await saveToken(db, token);
      res.redirect('/');
    });

  // Handle redirect and SSR requests
  app.use('*', async (req, res, next) => {
    const redirect = await initializeToken(db, refreshInterval);
    if (redirect) {
      res.redirect(redirect);
      return;
    }

    const url = req.originalUrl;
    try {
      const template = await vite.transformIndexHtml(
        url,
        fs.readFileSync('./client/index.html', 'utf-8')
      );
      const { render } = await vite.ssrLoadModule('./client/entry-server.jsx');
      const appHtml = await render(url);
      const html = template.replace(`<!--ssr-outlet-->`, appHtml?.html);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });

  // Create HTTPS server
  https.createServer({ key, cert }, app).listen(port, () => {
    console.log(`HTTPS server running at ${origin}`);
  });
}

createServer();