// CurationsLA Content Sourcer
// Purpose: Content sourcing and Ghost Pro draft creation ONLY

import sources from '../config/sources.json';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers for all responses
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      switch (path) {
        case '/health':
          return new Response(JSON.stringify({
            status: 'ok',
            purpose: env.PURPOSE || 'content_sourcing_only',
            timestamp: new Date().toISOString()
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });

        case '/api/source-content':
          return await handleSourceContent(request, env);

        case '/api/create-draft':
          return await handleCreateDraft(request, env);

        default:
          return new Response('Not Found', { 
            status: 404,
            headers: corsHeaders
          });
      }
    } catch (error) {
      console.error('Worker Error:', error);
      return new Response(JSON.stringify({
        error: 'Internal Server Error',
        message: error.message
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  },

  async scheduled(controller, env, ctx) {
    // Daily content gathering at 6 AM PT
    await gatherDailyContent(env);
  }
};

// Source content from RSS feeds
async function handleSourceContent(request, env) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  try {
    const sourcedContent = [];
    
    for (const feed of sources.rss_feeds) {
      try {
        const response = await fetch(feed.url);
        const rssText = await response.text();
        
        // Basic RSS parsing
        const items = parseRSSItems(rssText);
        const filteredItems = filterGoodVibesContent(items);
        
        sourcedContent.push({
          source: feed.name,
          category: feed.category,
          items: filteredItems.slice(0, 5) // Limit to 5 items per source
        });
      } catch (error) {
        console.error(`Error fetching ${feed.name}:`, error);
      }
    }

    // Store in KV for processing
    const contentKey = `content_${new Date().toISOString().split('T')[0]}`;
    await env['curationsla-content-storage'].put(contentKey, JSON.stringify(sourcedContent));

    return new Response(JSON.stringify({
      success: true,
      message: 'Content sourced successfully',
      sources_processed: sources.rss_feeds.length,
      items_found: sourcedContent.reduce((total, source) => total + source.items.length, 0),
      storage_key: contentKey
    }), { headers: corsHeaders });

  } catch (error) {
    console.error('Source content error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to source content',
      message: error.message
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
}

// Create Ghost Pro draft
async function handleCreateDraft(request, env) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  try {
    const body = await request.json();
    const { title, publicationDate } = body;

    // Get stored content from KV
    const contentKey = `content_${publicationDate || new Date().toISOString().split('T')[0]}`;
    const storedContent = await env['curationsla-content-storage'].get(contentKey);
    
    if (!storedContent) {
      return new Response(JSON.stringify({
        error: 'No content found',
        message: 'Please source content first'
      }), {
        status: 404,
        headers: corsHeaders
      });
    }

    const content = JSON.parse(storedContent);
    const draftContent = generateDraftHTML(content, title || `CurationsLA Good Vibes - ${new Date().toLocaleDateString()}`);

    // Create Ghost Pro draft
    const ghostResponse = await createGhostDraft({
      title: draftContent.title,
      html: draftContent.html,
      status: 'draft',
      tags: ['curations-la', 'good-vibes', 'newsletter']
    }, env);

    return new Response(JSON.stringify({
      success: true,
      message: 'Draft created successfully',
      ghost_post_id: ghostResponse.id,
      draft_url: `${env.GHOST_SITE_URL}/ghost/#/editor/post/${ghostResponse.id}`
    }), { headers: corsHeaders });

  } catch (error) {
    console.error('Create draft error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to create draft',
      message: error.message
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
}

async function gatherDailyContent(env) {
  // Automated daily content gathering
  try {
    const request = new Request('https://la.curations.cc/api/source-content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger: 'scheduled' })
    });
    await handleSourceContent(request, env);
  } catch (error) {
    console.error('Daily content gathering failed:', error);
  }
}

// Parse RSS items from XML
function parseRSSItems(rssText) {
  const items = [];
  
  // Basic regex parsing (for production, use proper XML parser)
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  const titleRegex = /<title[^>]*><!\[CDATA\[([^\]]+)\]\]><\/title>|<title[^>]*>([^<]+)<\/title>/i;
  const linkRegex = /<link[^>]*>([^<]+)<\/link>/i;
  const descRegex = /<description[^>]*><!\[CDATA\[([^\]]+)\]\]><\/description>|<description[^>]*>([^<]+)<\/description>/i;
  
  let match;
  while ((match = itemRegex.exec(rssText)) !== null) {
    const itemContent = match[1];
    
    const titleMatch = titleRegex.exec(itemContent);
    const linkMatch = linkRegex.exec(itemContent);
    const descMatch = descRegex.exec(itemContent);
    
    if (titleMatch && linkMatch) {
      items.push({
        title: titleMatch[1] || titleMatch[2],
        link: linkMatch[1],
        description: descMatch ? (descMatch[1] || descMatch[2]) : ''
      });
    }
  }
  
  return items;
}

// Filter content for Good Vibes only
function filterGoodVibesContent(items) {
  return items.filter(item => {
    const text = `${item.title} ${item.description}`.toLowerCase();
    
    // Check for negative keywords
    const hasNegative = sources.negative_keywords.some(keyword => 
      text.includes(keyword.toLowerCase())
    );
    
    if (hasNegative) return false;
    
    // Check for Good Vibes keywords
    const goodVibesScore = sources.good_vibes_keywords.reduce((score, keyword) => {
      return text.includes(keyword.toLowerCase()) ? score + 1 : score;
    }, 0);
    
    // Check for LA keywords
    const hasLAKeyword = sources.content_filters.required_la_keywords.some(keyword => 
      text.includes(keyword.toLowerCase())
    );
    
    return goodVibesScore >= sources.content_filters.min_good_vibes_score && hasLAKeyword;
  });
}

// Generate HTML for Ghost draft
function generateDraftHTML(content, title) {
  let html = `<h1>${title}</h1>\n<p><em>A curated collection of Good Vibes from around LA</em></p>\n\n`;
  
  content.forEach(source => {
    if (source.items.length > 0) {
      html += `<h2>${source.source} - ${source.category}</h2>\n<ul>\n`;
      
      source.items.forEach(item => {
        html += `<li><a href="${item.link}" target="_blank">${item.title}</a>`;
        if (item.description) {
          html += `<br><small>${item.description.substring(0, 150)}...</small>`;
        }
        html += `</li>\n`;
      });
      
      html += `</ul>\n\n`;
    }
  });
  
  html += `<hr>\n<p><small>🤖 <em>A project curated by Humans x AI at <a href="https://curations.cc">Curations.cc</a></em></small></p>`;
  
  return { title, html };
}

// Create Ghost Pro draft via Admin API
async function createGhostDraft(postData, env) {
  const jwt = generateGhostJWT(env.GHOST_ADMIN_API_KEY);
  
  const response = await fetch(`${env.GHOST_SITE_URL}/ghost/api/admin/posts/`, {
    method: 'POST',
    headers: {
      'Authorization': `Ghost ${jwt}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ posts: [postData] })
  });
  
  if (!response.ok) {
    throw new Error(`Ghost API error: ${response.status} ${response.statusText}`);
  }
  
  const result = await response.json();
  return result.posts[0];
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