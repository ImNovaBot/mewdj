# AI DJ Pro Setup Guide

Get your professional AI DJ running in minutes!

## Quick Start

### 1. Install Dependencies
```bash
cd ai-dj
npm install
```

### 2. Create Spotify App
1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/applications)
2. Click "Create an App"
3. Fill in:
   - **App name**: "AI DJ Pro"
   - **App description**: "Personal AI DJ with professional mixing"
   - **Website**: `http://localhost:3000`
   - **Redirect URI**: `http://localhost:3000/callback`
4. Click "Save"
5. Copy your **Client ID** and **Client Secret**

### 3. Configure Environment
```bash
cp .env.example .env
```

Edit `.env` and add your credentials:
```env
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
REDIRECT_URI=http://localhost:3000/callback
PORT=3000
```

### 4. Start the AI DJ
```bash
npm start
```

### 5. Connect Your Spotify
1. Open http://localhost:3000
2. Click "Connect Spotify"
3. Log in with your Spotify Premium account
4. You're ready to DJ! 🎧

## Features Overview

### 🎛️ Professional DJ Controls
- **Beat matching** - Perfect BPM sync
- **Harmonic mixing** - Key-compatible transitions  
- **Crossfader** - Real-time mixing control
- **Effects rack** - Reverb, filters, echo, air horns

### 🧠 AI-Powered Features
- **Smart song requests** - "Play something uplifting"
- **Auto-mixing** - Let AI take over completely
- **Intelligent queue** - Harmonic flow optimization
- **Crowd reading** - Energy level management

### 🎵 Professional Transitions
- **Echo rolls** - Build tension before drops
- **Filter sweeps** - Smooth frequency transitions
- **Bass drops** - Cut bass, build energy, drop
- **Harmonic mixing** - Compatible key progressions

## Usage Tips

### Song Requests
Instead of just song names, try these natural requests:
- "Play something energetic"
- "Slow it down a bit"
- "Drop the bass"  
- "Something the crowd will love"
- "Levels by Avicii" (specific songs work too!)

### Mixing Modes
- **🧠 AI Smart Mix** - Harmonic + energy flow
- **🎹 Harmonic Only** - Key-compatible only
- **⚡ Energy Flow** - Build/release patterns
- **✋ Manual** - You control everything

### Pro DJ Techniques
- Use **echo rolls** before big drops
- **Filter sweep** for smooth transitions  
- **Cut bass** before drops for maximum impact
- Layer **sound effects** for crowd engagement

## CarPlay Usage

The AI DJ works great in your car:

1. **Start session** before driving
2. **Enable Auto-Mix** mode
3. Use **voice requests** via Siri:
   - "Hey Siri, open Safari and go to localhost:3000"
   - Then make requests through the web interface
4. **Spotify connects** to CarPlay normally
5. AI handles all the mixing behind the scenes

## Advanced Features

### Custom Sound Effects
Add your own samples to the effects rack:
1. Place audio files in `public/samples/`
2. Update `dj-techniques.js` samples object
3. Trigger via effects buttons

### Multiple Users
Share your DJ session:
1. Others can connect to your session URL
2. Everyone can make requests
3. One person's Spotify plays for all
4. Perfect for parties!

### Energy Management
The AI reads crowd energy by:
- Recent song choices
- Request patterns  
- Time of day
- Music energy levels

## Troubleshooting

### "Not Connected to Spotify"
- Make sure you have Spotify Premium
- Check your Client ID/Secret in `.env`
- Verify Redirect URI matches exactly

### "No Audio Playing"  
- Open Spotify app on your device
- Start playing any song first
- Then use AI DJ controls

### "API Rate Limits"
- You get 10,000 requests/day free
- Each song = ~5 requests
- Heavy mixing = more requests
- Upgrade Spotify plan if needed

## What Makes This "Festival-Level"?

### 🎯 Precision Beat Matching
- Analyzes actual audio waveforms
- Syncs beats to the millisecond
- Phrase-aware mixing (16/32 bar loops)

### 🎵 Harmonic Intelligence  
- Camelot wheel compatibility
- Energy flow optimization
- Key progression planning

### 🎛️ Professional Effects
- Echo rolls with feedback automation
- Filter sweeps with cutoff curves
- Bass drop techniques
- Sample triggering

### 🧠 Crowd Psychology
- Energy building/release cycles
- Request pattern analysis
- Time-aware music selection
- Vibe matching algorithms

This isn't just a playlist - it's a full DJ experience that adapts and flows like a human DJ would, but with perfect technical precision.

## Next Steps

Once you're comfortable with the basics:

1. **Experiment with transitions** - Try different mixing styles
2. **Build custom playlists** - Let AI learn your style  
3. **Add friends** - Share sessions for group control
4. **Customize effects** - Add your own samples and techniques

Ready to drop some beats? Let's go! 🎧🔥