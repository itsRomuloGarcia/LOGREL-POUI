// So para desenvolvimento local (npm start): repassa /api para o REST do
// Protheus. Endereco e credencial SO por variavel de ambiente, nunca no codigo:
//   $env:LOGREL_REST = "https://servidor:porta/rest"
//   $env:LOGREL_AUTH = "usuario:senha"
// Dentro do Protheus (FwCallApp) este arquivo nao e usado.
const alvo = process.env.LOGREL_REST;
const auth = process.env.LOGREL_AUTH;

if (!alvo) {
  console.warn('[proxy] LOGREL_REST nao definido: chamadas /api vao falhar.');
}

module.exports = {
  '/api': {
    target: alvo || 'http://localhost:1',
    changeOrigin: true,
    secure: false,
    headers: auth ? { Authorization: 'Basic ' + Buffer.from(auth).toString('base64') } : {},
  },
};
