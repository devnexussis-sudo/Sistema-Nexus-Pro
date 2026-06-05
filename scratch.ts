import { analyzeAndDiscover } from './src/services/dunoBrain';

async function test() {
  const result = await analyzeAndDiscover('como inativar um tecnico');
  console.log(result);
}
test();
