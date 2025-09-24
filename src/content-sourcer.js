// CurationsLA Content Sourcer - Ghost Draft Creator ONLY
// No subscriber interaction, no publishing, just content → drafts

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // ONLY content sourcing and draft creation endpoints
    if (url.pathname === '/api/source-content') {
      return await sourceContent(env);
    }
    
    if (url.pathname === '/api/create-draft') {
      return await createGhostDraft(request, env);
    }
    
    if (url.pathname === '/health') {
      return new Response('Content Sourcer Active', { status: 200 });
    }
    
    return new Response('CurationsLA Content Sourcing API', {
      headers: { 'Content-Type': 'text/plain' }
    });
  },
  
  async scheduled(controller, env, ctx) {
    // Daily content gathering at 6 AM PT
    await gatherDailyContent(env);
  }
};

async function sourceContent(env) {
  const sources = [
    'https://lataco.com/rss',
    'https://la.eater.com/rss/index.xml',
    'https://laist.com/feeds/all.rss',
    'https://timeout.com/los-angeles/rss.xml'
  ];
  
  const content = [];
  for (const source of sources) {
    try {
      const response = await fetch(source);
      const text = await response.text();
      // Parse and filter content (Good Vibes Only)
      content.push(await parseAndFilter(text));
    } catch (error) {
      console.error(`Failed to fetch ${source}:`, error);
    }
  }
  
  return new Response(JSON.stringify({ content }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function createGhostDraft(request, env) {
  const { title, content, publicationDate } = await request.json();
  
  // Ghost Pro API endpoint (curationsla-1.ghost.io)
  const ghostApiUrl = 'https://curationsla-1.ghost.io/ghost/api/v4/admin/posts/';
  
  const draft = {
    posts: [{
      title: title || `CurationsLA - ${publicationDate}`,
      status: 'draft',
      tags: ['newsletter'],
      html: content
    }]
  };
  
  // Create draft in Ghost Pro
  const response = await fetch(ghostApiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Ghost ${env.GHOST_ADMIN_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(draft)
  });
  
  if (!response.ok) {
    throw new Error(`Ghost API error: ${response.status}`);
  }
  
  const result = await response.json();
  
  return new Response(JSON.stringify({ 
    success: true, 
    draftId: result.posts[0].id,
    editUrl: `https://curationsla-1.ghost.io/ghost/#/editor/post/${result.posts[0].id}`
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function gatherDailyContent(env) {
  // Automated daily content gathering
  const contentResponse = await sourceContent(env);
  const content = await contentResponse.json();
  
  // Store in KV for processing
  await env.CONTENT_KV.put(`content:${new Date().toISOString()}`, JSON.stringify(content));
}

function parseAndFilter(content) {
  // Good Vibes filter - NO politics, crime, negativity
  const bannedWords = ['politics', 'crime', 'shooting', 'controversy', 'death'];
  
  // Basic filtering logic - in production, this would be more sophisticated
  const filtered = content.toLowerCase();
  for (const word of bannedWords) {
    if (filtered.includes(word)) {
      return null; // Filter out negative content
    }
  }
  
  return content;
}