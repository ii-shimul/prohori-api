const apiUrl = process.env.API_URL ?? 'http://localhost:3000/api/v1';
const token = process.env.ADMIN_ACCESS_TOKEN;

if (!token) {
  console.error('ADMIN_ACCESS_TOKEN must contain a DEMO_ADMIN bearer JWT.');
  process.exitCode = 1;
} else {
  const response = await fetch(`${apiUrl}/simulation/reset`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  });
  const body = await response.text();

  if (!response.ok) {
    console.error(`Simulation reset failed (${response.status}): ${body}`);
    process.exitCode = 1;
  } else {
    console.log(body);
  }
}
