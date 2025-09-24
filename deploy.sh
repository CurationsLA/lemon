#!/bin/bash

# CurationsLA Content Sourcing Deployment Script
echo "🍋 Deploying CurationsLA Content Sourcing System..."

# Check if wrangler is installed
if ! command -v npx wrangler &> /dev/null; then
    echo "❌ Wrangler not found. Installing..."
    npm install -g wrangler
fi

# Check if logged into Cloudflare
echo "🔐 Checking Cloudflare authentication..."
if ! npx wrangler whoami &> /dev/null; then
    echo "Please login to Cloudflare:"
    npx wrangler login
fi

# Create KV namespace for content storage
echo "📦 Creating KV namespace for content storage..."
KV_ID=$(npx wrangler kv:namespace create "CONTENT_KV" --preview false | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

if [ ! -z "$KV_ID" ]; then
    echo "✅ KV namespace created: $KV_ID"
    
    # Update wrangler.toml with actual KV ID
    sed -i.backup "s/create-new-kv-for-content/$KV_ID/" wrangler.toml
    echo "✅ Updated wrangler.toml with KV namespace ID"
else
    echo "⚠️ KV namespace may already exist or creation failed"
fi

# Deploy the worker
echo "🚀 Deploying content sourcing worker..."
npx wrangler deploy

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ CurationsLA Content Sourcing Worker deployed successfully!"
    echo ""
    echo "📋 Next Steps:"
    echo "1. Set environment variables in Cloudflare dashboard:"
    echo "   - GHOST_ADMIN_API_KEY: Your Ghost Pro admin API key"
    echo "   - GHOST_ADMIN_URL: https://curationsla-1.ghost.io/ghost/api/admin"
    echo ""
    echo "2. Test the deployment:"
    echo "   curl https://curationsla-content-sourcer.workers.dev/health"
    echo ""
    echo "3. Worker endpoints:"
    echo "   - /api/source-content - Source LA content"
    echo "   - /api/create-draft - Create Ghost draft"
    echo "   - /health - Health check"
    echo ""
    echo "🎯 Purpose: Content sourcing and Ghost draft creation ONLY"
    echo "🚫 No subscriber management or email automation"
else
    echo "❌ Deployment failed. Please check the error above."
    exit 1
fi