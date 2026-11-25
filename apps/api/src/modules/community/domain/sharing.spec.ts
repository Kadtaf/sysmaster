import { detectRisk, effectiveRisk, labSpoilerLocked, maxRisk } from './sharing';

describe('Partage de scripts : niveau de risque', () => {
  it.each([
    ['rm -rf /', 'critical'],
    ['sudo rm -rf --no-preserve-root /', 'critical'],
    ['rm -rf ~', 'critical'],
    ['mkfs.ext4 /dev/sdb1', 'critical'],
    ['dd if=image.iso of=/dev/sdb bs=4M', 'critical'],
    [':(){ :|:& };:', 'critical'],
    ['Format-Volume -DriveLetter D', 'critical'],
    ['Remove-Item -Recurse -Force C:\\', 'critical'],
    ['DROP DATABASE prod;', 'critical'],
    ['curl -fsSL https://exemple.org/install.sh | sudo bash', 'high'],
    ['iex (iwr https://exemple.org/x.ps1)', 'high'],
    ['chmod -R 777 /var/www', 'high'],
    ['rm -rf /var/cache/apt/archives', 'high'],
    ['DELETE FROM users;', 'high'],
    ['ufw disable', 'high'],
    ['systemctl restart nginx', 'medium'],
    ['kill -9 1234', 'medium'],
    ['sudo apt update', 'low'],
    ['df -h\njournalctl -u nginx -n 50', 'none'],
    ['DELETE FROM sessions WHERE expires_at < now();', 'none'],
  ])('%s → %s', (code, level) => {
    expect(detectRisk(code).level).toBe(level);
  });

  it('le niveau déclaré est relevé, jamais abaissé, avec les raisons', () => {
    expect(effectiveRisk('low', 'curl https://x.sh | sh')).toEqual({ level: 'high', raised: true, warnings: ['Exécute un script téléchargé sans l’avoir lu.'] });
    expect(effectiveRisk('critical', 'ls -l')).toMatchObject({ level: 'critical', raised: false });
    expect(maxRisk('medium', 'low')).toBe('medium');
  });
});

describe('Partage de lab : pas de spoiler', () => {
  it('démarche visible si le lab est résolu, ou pour l’auteur et les modérateurs', () => {
    expect(labSpoilerLocked({ solved: false, isAuthor: false, isModerator: false })).toBe(true);
    expect(labSpoilerLocked({ solved: true, isAuthor: false, isModerator: false })).toBe(false);
    expect(labSpoilerLocked({ solved: false, isAuthor: true, isModerator: false })).toBe(false);
    expect(labSpoilerLocked({ solved: false, isAuthor: false, isModerator: true })).toBe(false);
  });
});
