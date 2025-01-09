import fs from "fs";
import "dotenv/config";

const googleClientSecret = JSON.parse(fs.readFileSync(process.env.GOOGLE_CLIENT_SECRET_PATH));

async function saveToken(db, token) {
  const expiresIn = token?.raw?.expires_in || 3599;
  const creationDate = Date.now();
  const expirationDate = creationDate + expiresIn * 1000;
  await db.run(
    `INSERT INTO secrets (key, value, creationDate, expirationDate) VALUES (?, ?, ?, ?)`,
    ['google_jwt', JSON.stringify(token), creationDate, expirationDate]
  );
}

async function refreshToken(db, currentToken) {
  try {
    // Get the refresh token
    const { refresh_token } = currentToken;

    // Make request to Google's token endpoint
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: googleClientSecret.web.client_id,
        client_secret: googleClientSecret.web.client_secret,
        refresh_token: refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to refresh token: ${response.statusText}`);
    }

    const newToken = await response.json();
    
    // Preserve the refresh token since Google doesn't send it again
    newToken.refresh_token = refresh_token;

    await saveToken(db, newToken);
    
    return newToken;
  } catch (error) {
    console.error('Failed to refresh token:', error);
    return null;
  }
}

async function getToken(db) {
  const latestSecret = await db.get(
    `SELECT * FROM secrets WHERE key = 'google_jwt' ORDER BY creationDate DESC LIMIT 1`
  );
  return latestSecret ? JSON.parse(latestSecret.value) : null;
}

async function initializeToken(db, refreshInterval) {
  const redirect = "/connect/google";
  const latestSecret = await getToken(db);

  if (latestSecret) {
    const currentTime = Date.now();
    // Refresh the token refreshInterval milliseconds before expiration
    const timeToRefresh = latestSecret.expirationDate - currentTime - refreshInterval;

    if (timeToRefresh > 0) {
      return null;
    } else {
      const token = await refreshToken(db, latestSecret);
      return token === null ? redirect : null;
    }
  } else {
    return redirect;
  }
}

async function checkAndRefreshToken(db, interval) {
  const latestSecret = await getToken(db);

  if (latestSecret) {
    const currentTime = Date.now();
    const timeToExpire = latestSecret.expirationDate - currentTime;

    // If the token expires in less than 5 minutes, refresh it
    if (timeToExpire <= interval) {
      console.log('Token is about to expire, refreshing...');
      await refreshToken(db, latestSecret);
    }
  }
}

export { initializeToken, saveToken, refreshToken, getToken, checkAndRefreshToken };