# Vesti — bolões esportivos

Aplicação web responsiva para bolões, palpites e rankings. O frontend usa HTML, CSS e JavaScript; autenticação, dados compartilhados, regras de acesso e imagens são fornecidos pelo Supabase.

## Requisitos

- Visual Studio Code
- Node.js LTS e npm
- Projeto Supabase
- Navegador moderno

## 1. Criar e preparar o Supabase

1. Crie um projeto em [supabase.com](https://supabase.com/).
2. No painel do projeto, abra **SQL Editor** e execute o conteúdo de [`supabase/schema.sql`](./supabase/schema.sql). O arquivo cria tabelas, relacionamentos, funções, políticas RLS, buckets de imagens e publicação Realtime. Execute-o uma vez em um projeto vazio.
3. Crie sua conta de usuário pelo site local (ou pela tela de usuários do Supabase). O trigger cria automaticamente o perfil.
4. Promova a primeira conta administradora pelo SQL Editor. Substitua pelo e-mail da sua conta:

   ```sql
   update public.profiles
   set role = 'admin'
   where id = (
     select id
     from auth.users
     where email = lower('seu-email@exemplo.com')
   );
   ```

   Esta operação é apenas para provisionar o primeiro administrador. Depois disso, o painel pode alterar permissões usando a função protegida `admin_set_profile_role`; cada inscrição nova recebe apenas o papel `user`.

5. Opcionalmente, execute [`supabase/seed.sql`](./supabase/seed.sql) para adicionar partidas futuras e um bolão público de demonstração. Execute depois de provisionar o administrador.
6. Em **Authentication → URL Configuration**, adicione `http://localhost:5173` como Site URL e Redirect URL. Para desenvolvimento rápido, desative a confirmação de e-mail em **Authentication → Providers → Email**; em produção, mantenha a confirmação ativada e configure o SMTP.

## 2. Configurar o projeto no VS Code

Abra a pasta do projeto no VS Code e use **Terminal → New Terminal**:

```powershell
npm install
Copy-Item .env.example .env
```

Edite `.env` com os valores de **Project URL** e a chave **publishable** (ou `anon`) em **Project Settings → API Keys**:

```dotenv
VITE_SUPABASE_URL=https://SEU_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_PUBLISHABLE_OU_ANON
```

Inicie o servidor local:

```powershell
npm run dev
```

Abra o endereço mostrado pelo Vite, normalmente `http://localhost:5173`. Para gerar e testar a versão de produção:

```powershell
npm run build
npm run preview
```

O arquivo `.env` é ignorado pelo Git. No frontend, use **somente** a chave publishable/anon: ela é pública por definição e só é segura junto às políticas RLS. Nunca use ou publique a chave `service_role`, tokens administrativos ou senhas no navegador.

## 3. Estrutura

```text
bolao/
├── css/
│   └── style.css
├── js/
│   ├── app.js           # telas, navegação e interação
│   └── supabase.js      # autenticação, consultas, RPC, uploads e Realtime
├── supabase/
│   ├── schema.sql       # esquema, funções e políticas RLS
│   └── seed.sql         # partidas e bolão para demonstração
├── .env.example
├── index.html
├── package.json
└── README.md
```

## Segurança e funcionamento

- O Supabase Auth gerencia cadastro, login, sessão persistente, logout e alteração de senha. Nenhuma senha de usuário é gravada no banco da aplicação ou em `localStorage`.
- O PostgreSQL armazena perfis, bolões, membros, partidas, vínculo entre bolões e partidas e palpites. Usuários veem bolões públicos ou dos quais participam.
- RLS protege todas as tabelas. A função `save_prediction` verifica participação, vínculo com a partida e prazo no servidor antes de inserir ou atualizar um palpite; a restrição única impede duplicatas.
- A leitura dos palpites de outras pessoas é liberada apenas depois do início da partida e quando o bolão habilita essa opção. O organizador pode configurar pontuação e visibilidade.
- Resultados oficiais e papéis administrativos só podem ser alterados por administradores. O primeiro administrador precisa ser provisionado no SQL Editor, fora do frontend.
- Rankings e pontos são recalculados a partir dos palpites visíveis e resultados armazenados no Supabase. Mudanças são atualizadas em tempo real via Realtime; para garantir o funcionamento, o esquema inclui as tabelas na publicação `supabase_realtime`.
- Uploads de avatar, capas dos bolões e escudos vão para os buckets públicos `avatars`, `pool-covers` e `team-logos`, com limites de tamanho e políticas por usuário/administrador. Os nomes, limites e tipos permitidos também são validados no Storage.
- Horários são enviados como ISO 8601 e armazenados como `timestamptz`; o bloqueio do palpite usa o horário do banco, independentemente do relógio do navegador.

## Se o projeto não conectar

- Confirme que `.env` está na raiz e contém as variáveis com o prefixo `VITE_`.
- Reinicie `npm run dev` depois de alterar `.env`.
- Confirme que o esquema foi executado no projeto Supabase correspondente às credenciais.
- Se a chave for inválida, use a chave publishable/anon do projeto, nunca `service_role`.
- Para ativar o painel administrativo, confira o papel da conta em `public.profiles`.
