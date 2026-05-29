# Supabase — SOU+BLU

Projeto: **sou+blu** (`dqptnlywbarvznpzgtuj`) — região `us-east-1`, status ativo.

## Conexão no app

Configuração em `js/config.js` (URL + chave anon). Opcional: sobrescrever antes de carregar os scripts:

```html
<script>
  window.SOUBLU_CONFIG = {
    SUPABASE_URL: 'https://dqptnlywbarvznpzgtuj.supabase.co',
    SUPABASE_ANON_KEY: 'sua-chave-anon'
  };
</script>
```

## Testar

```bash
node test-supabase.js
```

Deve listar **OK** para: users, proposals, clients, products, partners, meetings, trainings, tickets e os buckets de storage.

Migração treinamentos: `supabase/migrations/20260526180000_trainings.sql` (aplicar no SQL Editor ou via CLI).

## Tabelas (schema `public`)

| Tabela | Uso |
|--------|-----|
| users | Login, equipes, parceiros, saldos |
| clients | Clientes dos vendedores |
| proposals | Propostas |
| products / orders / transactions | Loja e pontos |
| withdrawals | Saques PIX |
| partners | Cadastro de parceiros |
| meetings | Reuniões |
| trainings | Tutoriais / palestras (conteúdo + prova) |
| training_attempts | Notas e status por colaborador |
| feedbacks | Feedbacks RH |
| tickets | Chamados |

RLS está habilitado com políticas permissivas para a chave **anon** (app usa login próprio na tabela `users`, não Supabase Auth).

## Storage (buckets públicos)

| Bucket | Uso |
|--------|-----|
| profile-photos | Foto de perfil (sidebar / Meu Perfil) |
| product-images | Imagens de produtos |
| proposal-attachments | Anexos de propostas |

## E-mail duplicado (cadastro de funcionário)

A tabela `users` tem constraint única em `email`. Ao cadastrar membro da equipe do parceiro:

- Use um **e-mail diferente** do login do parceiro e de outros usuários.
- Novos cadastros são gravados em **minúsculas** (trigger `users_normalize_email`).

Se ainda aparecer erro de duplicata, pode existir registro antigo com o mesmo e-mail. No SQL Editor do Supabase:

```sql
SELECT id, name, email, role, active, admin_id
FROM users
WHERE lower(trim(email)) = lower(trim('email@exemplo.com'));
```

### Duplicata conhecida no banco

Há dois usuários com o mesmo e-mail normalizado `elevavanessa22@gmail.com` (ids diferentes). Corrija manualmente no painel **Table Editor → users** (desative ou altere o e-mail do registro incorreto) antes de normalizar todos os e-mails em massa.

## Migrações locais

Arquivos em `supabase/migrations/` documentam alterações aplicadas no projeto remoto.

## Painel Supabase

https://supabase.com/dashboard/project/dqptnlywbarvznpzgtuj
