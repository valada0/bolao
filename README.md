# Vesti — bolões esportivos

Aplicação web em HTML, CSS e JavaScript, com Supabase Auth, PostgreSQL, Row Level Security (RLS) e Supabase Storage. Os dados do produto são persistidos no Supabase e compartilhados entre usuários. O SDK do Supabase mantém somente a sessão/token de autenticação no navegador; o app não usa LocalStorage como banco de dados.

## Requisitos

- Visual Studio Code
- Node.js LTS e npm
- Um projeto Supabase

## Configuração do Supabase

1. Crie um projeto em [supabase.com](https://supabase.com/).
2. No painel do projeto, abra **SQL Editor**, crie uma consulta e execute o conteúdo de [`supabase/schema.sql`](./supabase/schema.sql) uma única vez. O script cria tabelas, relacionamentos, índices, funções, políticas RLS, o bucket público de imagens e times/partidas de demonstração.
3. Em **Project Settings → API**, copie a **Project URL** e a chave **publishable** (ou a chave pública `anon` legada). Nunca use a chave `service_role` no navegador ou em arquivos versionados.
4. No VS Code, copie `.env.example` para `.env.local` e preencha as variáveis:

   ```dotenv
   VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
   VITE_SUPABASE_ANON_KEY=sua_chave_publishable_ou_anon
   ```

   A URL e a chave pública são enviadas ao frontend. O acesso aos dados é protegido pelas políticas RLS; nenhuma chave administrativa deve ser colocada neste arquivo.

5. Em **Authentication → URL Configuration**, adicione `http://localhost:5173` à lista de URLs permitidas. Se for testar confirmação de e-mail, configure também a URL de redirecionamento para `http://localhost:5173`.
6. Para liberar a administração inicial, primeiro cadastre sua própria conta pelo site e confirme o e-mail. Em seguida, rode no SQL Editor, substituindo o endereço:

   ```sql
   update public.profiles
   set role = 'admin'
   where id = (select id from auth.users where email = 'voce@exemplo.com');
   ```

   Atualize o site após a promoção. A criação de administradores é deliberadamente uma operação administrativa do banco, não uma opção pública de cadastro.

## Executar localmente no VS Code

Abra a pasta do projeto no VS Code e use **Terminal → New Terminal**:

```powershell
npm install
Copy-Item .env.example .env.local
```

Edite `.env.local` com as credenciais públicas do seu projeto e inicie o servidor de desenvolvimento:

```powershell
npm run dev
```

Abra o endereço mostrado pelo Vite, normalmente `http://localhost:5173`. Não abra o `index.html` diretamente como arquivo: as variáveis de ambiente e os módulos JavaScript são servidos pelo Vite.

Verifique a versão de produção e sirva a compilação localmente com:

```powershell
npm run build
npm run preview
```

Não publique `.env.local`, `node_modules` ou `dist`. O `.gitignore` já exclui esses caminhos.

## Dados de demonstração

O SQL insere times e partidas futuras, sem usuários, senhas ou bolões com credenciais compartilhadas. Cadastre uma conta e crie um bolão para associar os jogos de demonstração disponíveis. Convide outras contas com o código gerado pelo banco.

## Tabelas e segurança

- `profiles`: nome, foto e papel associado à conta `auth.users`.
- `teams`: times e caminho do escudo no Storage.
- `matches`: partidas, horários e resultados oficiais.
- `pools`: bolões, privacidade, código de convite e regras de pontuação.
- `pool_members`: participantes de cada bolão.
- `pool_matches`: partidas associadas a cada bolão.
- `predictions`: placares, com unicidade por usuário, bolão e partida.
- `public-assets` (Storage): fotos de perfil e escudos; uploads de perfil ficam na pasta do próprio usuário.

O SQL ativa RLS em todas as tabelas. As políticas restringem alterações de partidas/times e permissões de usuário a administradores; limitam palpites ao participante até o início do jogo; e liberam palpites de terceiros somente após o início quando a regra do bolão permite. As funções `create_pool`, `join_pool_by_code`, `join_public_pool` e `get_pool_standings` aplicam as operações controladas no servidor. A pontuação e o ranking são calculados no PostgreSQL e atualizados quando o administrador registra ou corrige um resultado. O script também adiciona as tabelas da aplicação à publicação `supabase_realtime` quando ela está disponível; clientes autenticados atualizam os dados visíveis ao receber mudanças.

O frontend usa apenas `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (chave pública). A proteção não depende de esconder a URL ou a chave pública: a autorização é feita no banco por RLS. Não coloque `service_role`, senha de banco ou segredo de API em variáveis `VITE_*`.

## Estrutura

```text
index.html
css/style.css
js/app.js
js/main.js
js/storage.js
supabase/schema.sql
```
