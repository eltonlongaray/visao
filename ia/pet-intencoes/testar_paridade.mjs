// Confere se o JS dá o mesmo resultado que o Python em todas as frases de teste.
// Uso: node testar_paridade.mjs
import { readFileSync } from 'node:fs';
import { carregarModelo } from '../../js/pet-ia/pet-intencao.js';
import modelo from '../../js/pet-ia/pet-intencoes-modelo.js';

const gabarito = JSON.parse(readFileSync(new URL('./modelo/gabarito-paridade.json', import.meta.url)));
const classificar = carregarModelo(modelo);

let erros = 0;
for (const g of gabarito) {
  const r = classificar(g.frase);
  // Pesos foram arredondados no JSON, então aceita diferença pequena na confiança
  if (r.intencao !== g.intencao || Math.abs(r.confianca - g.conf) > 0.01) {
    erros++;
    console.log(`DIFERENTE: "${g.frase}" → JS ${r.intencao} ${r.confianca.toFixed(4)} | Python ${g.intencao} ${g.conf}`);
  }
}
console.log(`${gabarito.length - erros}/${gabarito.length} frases iguais ao Python`);
process.exit(erros ? 1 : 0);
