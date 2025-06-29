#!/usr/bin/env node

// Local Timer Monitor - Simulates Supabase cron for database timer monitoring
// This script calls the database timer monitoring function every 10 seconds
// Much faster than calling Edge Functions - simulates production cron setup

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

let isRunning = false;
let intervalId = null;

async function callDatabaseTimerMonitor() {
  if (isRunning) {
    console.log('⏭️  Previous monitor call still running, skipping...');
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    console.log(`🔍 [${new Date().toISOString()}] Calling database timer monitor...`);

    // Call the database function directly (much faster than Edge Function)
    const { data, error } = await supabase.rpc('monitor_game_timers_db');

    const duration = Date.now() - startTime;

    if (error) {
      console.log(`❌ Error: ${error.message}`);
      console.log(`   Duration: ${duration}ms\n`);
    } else {
      console.log(`✅ Success: Processed ${data.processed}, Errors: ${data.errors}, Skipped: ${data.skipped}`);
      console.log(`   Duration: ${duration}ms\n`);

      if (data.processed > 0) {
        console.log(`🎮 Processed ${data.processed} expired games`);
      }
    }

  } catch (error) {
    const duration = Date.now() - startTime;
    console.log(`💥 Exception: ${error.message}`);
    console.log(`   Duration: ${duration}ms\n`);
  } finally {
    isRunning = false;
  }
}

function startMonitoring() {
  console.log('🚀 Starting local database timer monitor...');
  console.log(`📡 Supabase URL: ${process.env.VITE_SUPABASE_URL}`);
  console.log('🗄️  Using direct database function calls (faster than Edge Functions)');
  console.log('⏰ Running every 10 seconds (Ctrl+C to stop)\n');

  // Call immediately
  callDatabaseTimerMonitor();

  // Then call every 10 seconds
  intervalId = setInterval(callDatabaseTimerMonitor, 10000);
}

function stopMonitoring() {
  console.log('\n🛑 Stopping timer monitor...');
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  process.exit(0);
}

// Handle graceful shutdown
process.on('SIGINT', stopMonitoring);
process.on('SIGTERM', stopMonitoring);

// Start monitoring
startMonitoring();
