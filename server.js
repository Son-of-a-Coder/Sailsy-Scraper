import express from 'express';
import dotenv from 'dotenv';
import axios from 'axios';
import { chromium } from 'playwright';
import puppeteer from 'puppeteer';
import TurndownService from 'turndown';

dotenv.config();

const app = express();
app.use(express.json());

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-'
});

function buildFirecrawlLikeResponse({ url, html, title }) {
  return {
    url,
    title,
    html,
    markdown: turndownService.turndown(html),
    text: turndownService.turndown(html).replace(/[#>*_\-\n]/g, '').trim(),
    metadata: {
      length: html.length,
      source: 'browser'
    }
  };
}

function cleanHTML(html) {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);
}

/**
 * Playwright scraper
 */
async function scrapePlaywright(url) {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process'
    ]
  });
  const page = await browser.newPage();

  await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });
  const html = await page.content();
  const title = await page.title();
  const metadata = await page.evaluate(() =>
    document.querySelector('meta[name="description"]')?.content || null
  );

  await browser.close();

  return {
    "title": title,
    "metadata": metadata,
    "content": cleanHTML(html)
  };

  // return cleanHTML(html);
  // return buildFirecrawlLikeResponse({ url, html, title });
  return html;
}

/**
 * Puppeteer scraper
 */
async function scrapePuppeteer(url) {
  const browser = await puppeteer.launch({ 
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      // "--single-process"
    ]
  });
  const page = await browser.newPage();

  await page.goto(url, {
    waitUntil: 'networkidle2'
  });
  const html = await page.content();
  const title = await page.title();
  const metadata = await page.evaluate(() =>
    document.querySelector('meta[name="description"]')?.content || null
  );

  await browser.close();

  return {
    "title": title,
    "metadata": metadata,
    "content": cleanHTML(html)
  };
  
  // return cleanHTML(html);
  // return buildFirecrawlLikeResponse({ url, html, title });
  return html;
}

/**
 * Routes
 */
app.get('/api/scrape/ip', async (req, res) => {
  try {
    const response = await axios.get('https://api.ipify.org?format=json');
    const { ip } = response.data;
    // res.json({ ip });
    // return;
    const data = await axios.get(`https://ipapi.co/${ip}/json/`);;
    res.json({ source: 'ip', data: data.data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/scrape/playwright', async (req, res) => {
  try {
    const { url } = req.body;
    const data = await scrapePlaywright(url);
    res.json({ source: 'playwright', data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/scrape/puppeteer', async (req, res) => {
  try {
    const { url } = req.body;
    const data = await scrapePuppeteer(url);
    res.json({ source: 'puppeteer', data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Server start
 */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Scraper API running on port ${PORT}`);
});
