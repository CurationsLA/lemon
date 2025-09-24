/**
 * CurationsLA Master Router
 * Combines content sourcing API with existing SEO/redirect functionality
 * This allows both new functionality and preserves existing routes
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const hostname = url.hostname;

    // CORS headers for API access
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle OPTIONS requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Log request for debugging
    console.log(`[${new Date().toISOString()}] ${request.method} ${hostname}${pathname}`);

    try {
      // ============================================
      // CONTENT SOURCING API ROUTES
      // ============================================
      if (pathname === '/health') {
        return new Response(JSON.stringify({
          status: 'healthy',
          service: 'CurationsLA Router',
          purpose: 'Content sourcing and SEO routing',
          ghost_endpoint: 'curationsla-1.ghost.io',
          timestamp: new Date().toISOString(),
          features: {
            content_sourcing: true,
            seo_redirects: true,
            newsletter_pages: true
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Content sourcing API endpoints
      if (pathname === '/api/source-content' && request.method === 'POST') {
        return await handleSourceContent(request, env, corsHeaders);
      }

      if (pathname === '/api/get-content' && request.method === 'GET') {
        return await getSourcedContent(env, corsHeaders);
      }

      if (pathname === '/api/create-draft' && request.method === 'POST') {
        return await createGhostDraft(request, env, corsHeaders);
      }

      // ============================================
      // DOMAIN REDIRECTS (Preserve SEO)
      // ============================================
      const domainRedirects = {
        'la.curations.org': 'la.curations.cc',
        'curatedla.xyz': 'la.curations.cc',
        'www.la.curations.cc': 'la.curations.cc',
        'curatedla.beehiiv.com': 'la.curations.cc'
      };

      if (domainRedirects[hostname]) {
        return Response.redirect(
          `https://${domainRedirects[hostname]}${pathname}${url.search}`,
          301
        );
      }

      // ============================================
      // LEGACY NEWSLETTER ROUTES (Preserve SEO)
      // ============================================
      
      // Handle old Beehiiv paths
      if (pathname.startsWith('/p/')) {
        const slug = pathname.slice(3);
        // Redirect to your Ghost newsletter archive or a specific page
        return Response.redirect('https://la.curations.cc/newsletter/', 302);
      }

      // Handle subscribe paths
      if (pathname === '/subscribe' || pathname === '/newsletter') {
        // You can redirect to Ghost subscription page or return a custom page
        return Response.redirect('https://curationsla-1.ghost.io/#/portal/signup', 302);
      }

      // ============================================
      // MAIN WEBSITE PAGES
      // ============================================
      
      if (pathname === '/') {
        // Homepage - can be customized or fetch from Ghost
        return new Response(generateHomepage(), {
          headers: { 
            'Content-Type': 'text/html',
            'Cache-Control': 'public, max-age=3600'
          }
        });
      }

      if (pathname === '/about') {
        return new Response(generateAboutPage(), {
          headers: { 
            'Content-Type': 'text/html',
            'Cache-Control': 'public, max-age=3600'
          }
        });
      }

      // ============================================
      // SITEMAP & ROBOTS.TXT (SEO Critical)
      // ============================================
      
      if (pathname === '/sitemap.xml') {
        return new Response(generateSitemap(hostname), {
          headers: { 
            'Content-Type': 'application/xml',
            'Cache-Control': 'public, max-age=86400'
          }
        });
      }

      if (pathname === '/robots.txt') {
        return new Response(generateRobotsTxt(hostname), {
          headers: { 
            'Content-Type': 'text/plain',
            'Cache-Control': 'public, max-age=86400'
          }
        });
      }

      // ============================================
      // FALLBACK TO GHOST OR 404
      // ============================================
      
      // For any other paths, you could:
      // 1. Proxy to Ghost
      // 2. Check if it's a valid Ghost page
      // 3. Return 404 with a nice error page
      
      // For now, return a styled 404
      return new Response(generate404Page(), {
        status: 404,
        headers: { 'Content-Type': 'text/html' }
      });

    } catch (error) {
      console.error('Router error:', error);
      return new Response(JSON.stringify({
        error: 'Internal server error',
        message: error.message
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

// ============================================
// CONTENT SOURCING FUNCTIONS
// ============================================

async function handleSourceContent(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { sources = [], category = 'general', maxItems = 10 } = body;

    // Default LA content sources
    const defaultSources = [
      'https://laist.com/feeds/all.rss',
      'https://la.eater.com/rss/index.xml',
      'https://www.timeout.com/los-angeles/rss.xml'
    ];

    const sourcesToFetch = sources.length ? sources : defaultSources;
    const sourcedContent = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      category,
      sources: sourcesToFetch,
      content: {
        title: `LA Newsletter Draft - ${new Date().toLocaleDateString()}`,
        items: []
      },
      status: 'sourced'
    };

    // Fetch and parse RSS feeds
    for (const sourceUrl of sourcesToFetch) {
      try {
        const response = await fetch(sourceUrl);
        const xmlText = await response.text();
        const items = parseRSSFeed(xmlText, Math.ceil(maxItems / sourcesToFetch.length));
        sourcedContent.content.items.push(...items);
      } catch (error) {
        console.error(`Failed to fetch ${sourceUrl}:`, error);
      }
    }

    // Filter for Good Vibes content
    sourcedContent.content.items = filterGoodVibes(sourcedContent.content.items);

    // Store in KV
    const key = `content:${sourcedContent.id}`;
    await env['curationsla-content-storage'].put(
      key,
      JSON.stringify(sourcedContent),
      { expirationTtl: 86400 * 7 }
    );

    return new Response(JSON.stringify({
      success: true,
      contentId: sourcedContent.id,
      itemCount: sourcedContent.content.items.length,
      message: 'Content sourced successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to source content',
      message: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function getSourcedContent(env, corsHeaders) {
  try {
    const contentList = await env['curationsla-content-storage'].list({
      prefix: 'content:'
    });

    const contents = [];
    for (const key of contentList.keys) {
      const content = await env['curationsla-content-storage'].get(key.name);
      if (content) {
        contents.push(JSON.parse(content));
      }
    }

    return new Response(JSON.stringify({
      success: true,
      count: contents.length,
      contents
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to get content',
      message: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function createGhostDraft(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { contentId, title, html, tags = [] } = body;

    const GHOST_URL = 'https://curationsla-1.ghost.io';
    const GHOST_ADMIN_API_KEY = env.GHOST_ADMIN_API_KEY;

    if (!GHOST_ADMIN_API_KEY) {
      throw new Error('Ghost Admin API key not configured');
    }

    // Create Ghost Pro draft via Admin API
    const jwt = generateGhostJWT(GHOST_ADMIN_API_KEY);
    
    const response = await fetch(`${GHOST_URL}/ghost/api/admin/posts/`, {
      method: 'POST',
      headers: {
        'Authorization': `Ghost ${jwt}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        posts: [{
          title: title || `CurationsLA Draft - ${new Date().toLocaleDateString()}`,
          html: html || '<p>Content sourced and ready for editing!</p>',
          status: 'draft',
          tags: ['curations-la', 'newsletter', ...tags]
        }]
      })
    });
    
    if (!response.ok) {
      throw new Error(`Ghost API error: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    const post = result.posts[0];

    return new Response(JSON.stringify({
      success: true,
      message: 'Ghost draft created successfully',
      ghost_post_id: post.id,
      draft_url: `${GHOST_URL}/ghost/#/editor/post/${post.id}`,
      post_title: post.title
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to create Ghost draft',
      message: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// Generate JWT for Ghost Admin API
function generateGhostJWT(adminAPIKey) {
  // Split the key into ID and secret
  const [id, secret] = adminAPIKey.split(':');
  
  // Create header and payload
  const header = {
    alg: 'HS256',
    typ: 'JWT',
    kid: id
  };
  
  const payload = {
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (5 * 60), // 5 minutes
    aud: '/admin/'
  };
  
  // Base64url encode
  const encodedHeader = base64urlEscape(btoa(JSON.stringify(header)));
  const encodedPayload = base64urlEscape(btoa(JSON.stringify(payload)));
  
  // Create signature (simplified - in production use proper crypto)
  const signature = base64urlEscape(btoa(`${encodedHeader}.${encodedPayload}.${secret}`));
  
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function base64urlEscape(str) {
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function parseRSSFeed(xmlText, maxItems = 5) {
  const items = [];
  const itemMatches = xmlText.match(/<item[^>]*>[\s\S]*?<\/item>/gi) || [];

  for (let i = 0; i < Math.min(itemMatches.length, maxItems); i++) {
    const item = itemMatches[i];
    const titleMatch = item.match(/<title[^>]*>(.*?)<\/title>/i);
    const linkMatch = item.match(/<link[^>]*>(.*?)<\/link>/i);
    const descMatch = item.match(/<description[^>]*>(.*?)<\/description>/i);

    if (titleMatch && linkMatch) {
      items.push({
        title: cleanHtml(titleMatch[1]),
        link: linkMatch[1].trim(),
        excerpt: descMatch ? cleanHtml(descMatch[1]).substring(0, 200) + '...' : '',
        source: extractDomain(linkMatch[1])
      });
    }
  }

  return items;
}

function filterGoodVibes(items) {
  const bannedWords = ['crime', 'shooting', 'murder', 'death', 'accident'];
  const goodWords = ['art', 'music', 'food', 'culture', 'community', 'festival'];

  return items.filter(item => {
    const text = (item.title + ' ' + item.excerpt).toLowerCase();
    const hasNegative = bannedWords.some(word => text.includes(word));
    if (hasNegative) return false;
    const hasPositive = goodWords.some(word => text.includes(word));
    return hasPositive || Math.random() > 0.3;
  });
}

function cleanHtml(str) {
  return str.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim();
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return 'Unknown';
  }
}

// ============================================
// PAGE GENERATORS
// ============================================

function generateHomepage() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CurationsLA - Good Vibes Only</title>
    <meta name="description" content="Los Angeles culture, creativity, and community newsletter">
    <style>
        body { font-family: Georgia, serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        h1 { color: #2C3E50; }
        .hero { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px; border-radius: 10px; margin: 20px 0; }
        .subscribe { background: #FFD700; color: #2C3E50; padding: 15px 30px; text-decoration: none; border-radius: 25px; display: inline-block; font-weight: bold; }
    </style>
</head>
<body>
    <div class="hero">
        <h1>🌴 CurationsLA Newsletter</h1>
        <p>Your weekly dose of Los Angeles culture, creativity & community</p>
        <p>Curated good vibes from around the city - arts, food, events, and more!</p>
        <a href="https://curationsla-1.ghost.io/#/portal/signup" class="subscribe">Subscribe Now</a>
    </div>
    
    <h2>About CurationsLA</h2>
    <p>We're on a mission to share the best of Los Angeles - the creative energy, diverse communities, and positive stories that make our city special.</p>
    
    <h2>Recent Editions</h2>
    <p>Check out our latest newsletter editions on <a href="https://curationsla-1.ghost.io">our Ghost publication</a>.</p>
    
    <footer>
        <p>&copy; ${new Date().getFullYear()} CurationsLA • Part of <a href="https://curations.cc">Curations Agency</a></p>
    </footer>
</body>
</html>
  `;
}

function generateAboutPage() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>About CurationsLA</title>
    <meta name="description" content="About CurationsLA - Los Angeles culture and community newsletter">
    <style>
        body { font-family: Georgia, serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        h1 { color: #2C3E50; }
    </style>
</head>
<body>
    <h1>About CurationsLA</h1>
    <p>CurationsLA is a weekly newsletter celebrating the best of Los Angeles culture, creativity, and community.</p>
    <p>We focus on positive stories, local events, arts, food, and everything that makes LA special.</p>
    <p><a href="/">Back to Home</a></p>
</body>
</html>
  `;
}

function generate404Page() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>404 - Page Not Found</title>
    <style>
        body { font-family: Georgia, serif; max-width: 800px; margin: 0 auto; padding: 20px; text-align: center; }
        h1 { color: #2C3E50; font-size: 48px; }
        .emoji { font-size: 72px; }
    </style>
</head>
<body>
    <div class="emoji">🌴</div>
    <h1>404</h1>
    <p>Oops! This page seems to have taken a detour to the beach.</p>
    <p><a href="/">Return to Homepage</a></p>
</body>
</html>
  `;
}

function generateSitemap(hostname) {
  const urls = [
    { loc: '/', priority: '1.0', changefreq: 'daily' },
    { loc: '/about', priority: '0.8', changefreq: 'weekly' },
    { loc: '/newsletter', priority: '0.9', changefreq: 'weekly' },
    { loc: '/subscribe', priority: '0.9', changefreq: 'monthly' }
  ];

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  urls.forEach(url => {
    xml += `  <url>\n`;
    xml += `    <loc>https://${hostname}${url.loc}</loc>\n`;
    xml += `    <changefreq>${url.changefreq}</changefreq>\n`;
    xml += `    <priority>${url.priority}</priority>\n`;
    xml += `    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>\n`;
    xml += `  </url>\n`;
  });

  xml += '</urlset>';
  return xml;
}

function generateRobotsTxt(hostname) {
  return `# Robots.txt for CurationsLA
User-agent: *
Allow: /
Sitemap: https://${hostname}/sitemap.xml

# Block API endpoints from crawling
User-agent: *
Disallow: /api/

# Allow all major search engines
User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

User-agent: Slurp
Allow: /
`;
}