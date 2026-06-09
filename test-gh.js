import https from 'https';
import { execSync } from 'child_process';

const repo = 'devnexussis-sudo/Sistema-Nexus-Pro';
// Try to get git credentials or we can just fetch public. Wait, this repo is private!
// We can't fetch it without a token.
// Let's try to use the git credential helper to get a token if possible, or just ask the user.
