import express from 'express';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import 'dotenv/config';
import OpenAI from 'openai';

const app = express();
const port = process.env.PORT || 3000;
const openaiApiKey = process.env.OPENAI_API_KEY;
const perplexity = new OpenAI({
  apiKey: process.env.PERPLEXITY_API_KEY,
  baseURL: 'https://api.perplexity.ai'
});

async function createServer() {
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

  // Use web-enabled query as web search
  app.get('/api/web-search', async (req, res) => {
    try {
      const userQuery = req.query.query;
      // Perform query
      const completion = await perplexity.chat.completions.create({
        model: "llama-3.1-sonar-large-128k-online",
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

  // Handle SSR requests
  app.use('*', async (req, res, next) => {
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

  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

createServer();