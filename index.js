const express = require('express');
const app = express();
const path = require('path');
const bodyParser = require('body-parser');
const sequelize = require('./models/database');
const Usuario = require('./models/usuario');
const ContaBancaria = require('./models/conta_bancaria'); // Corrija a importação
const Transacao = require('./models/transacao');
const Categoria = require('./models/categoria');
// const { Sequelize } = require('sequelize'); // Importação do Sequelize no arquivo

// Sincronizar o banco de dados
sequelize.sync()
  .then(() => {
    console.log("Banco de dados sincronizado.");
  })
  .catch((err) => {
    console.error("Erro ao sincronizar o banco de dados:", err);
  });


  
const port = 4000;

// Set view engine to EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Body Parser Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(express.urlencoded({ extended: true })); // Para processar dados de formulário
app.use(express.json()); // Para processar dados JSO

// Static Folder
app.use(express.static(path.join(__dirname, 'public')));

const morgan = require('morgan');
app.use(morgan('dev'));  // Log de requisições HTTP

// Função para realizar a transação entre dois usuários
async function realizarTransacao(usuarioOrigem, usuarioDestino, valorTransacao, tipoTransacao, formaPagamento) {
  try {
    // Busca a conta do usuário de origem
    const contaOrigem = await ContaBancaria.findOne({ where: { ID_Usuario: usuarioOrigem } });
    if (!contaOrigem) {
      throw new Error('Conta de origem não encontrada');
    }

    // Verifica se há saldo suficiente na conta de origem
    const saldoOrigem = parseFloat(contaOrigem.saldo_atual) || 0;
    if (tipoTransacao === 'gasto' && saldoOrigem < valorTransacao) {
      throw new Error('Saldo insuficiente na conta de origem');
    }

    // Busca a conta do usuário de destino
    const contaDestino = await ContaBancaria.findOne({ where: { ID_Usuario: usuarioDestino } });
    if (!contaDestino) {
      throw new Error('Conta de destino não encontrada');
    }

    // Atualiza o saldo das duas contas
    const novoSaldoOrigem = saldoOrigem - valorTransacao;
    const novoSaldoDestino = parseFloat(contaDestino.saldo_atual) + valorTransacao;

    await ContaBancaria.update({ saldo_atual: novoSaldoOrigem }, { where: { ID_Conta: contaOrigem.ID_Conta } });
    await ContaBancaria.update({ saldo_atual: novoSaldoDestino }, { where: { ID_Conta: contaDestino.ID_Conta } });

    // Registra a transação na tabela Transacao
    await Transacao.create({
      ID_Conta: contaOrigem.ID_Conta,
      tipo: tipoTransacao,
      valor: valorTransacao,
      descricao: tipoTransacao === 'gasto' ? 'Retirada' : 'Depósito',
      forma_pagamento: formaPagamento,
      data_transacao: new Date(),
    });

    await Transacao.create({
      ID_Conta: contaDestino.ID_Conta,
      tipo: tipoTransacao === 'gasto' ? 'deposito' : 'gasto',
      valor: valorTransacao,
      descricao: tipoTransacao === 'gasto' ? 'Depósito' : 'Retirada',
      forma_pagamento: formaPagamento,
      data_transacao: new Date(),
    });

  } catch (error) {
    throw new Error(`Erro ao realizar transação: ${error.message}`);
  }
}

// Rotas
app.get('/', (req, res) => {
    res.render('cadastroUsuario');
});

app.get('/landingPage', (req, res) => {
    res.render('landingPage');
});

// Rota GET para renderizar a página de transação

// Rota GET para renderizar a página de transação
app.get('/transacao', async (req, res) => {
  try {
    const usuarios = await Usuario.findAll();
    res.render('transacao', { usuarios });
  } catch (error) {
    console.error('Erro ao buscar usuários:', error);
    res.status(500).send('Erro ao buscar usuários');
  } 
});

app.get('/testetransacao', async (req, res) => {
  res.send('Testando a rota de transação');
});

// Rota para transações
// Rota para processar transações
app.post('/transacao', async (req, res) => {
  console.log('req.body:', req.body);  // Verifique o que está chegando aqui
  const { usuarioId, contaId, valor, formaPagamento } = req.body;
  console.log('Dados recebidos:', { usuarioId, contaId, valor, formaPagamento });

  // Garantir que a forma de pagamento tenha um valor válido (ou 'deposito' como padrão)
  const formaPagamentoFinal = formaPagamento || 'deposito'; // Valor padrão

  try {
    const valorTransacao = parseFloat(valor);
    console.log('Valor recebido:', valor);

    if (isNaN(valorTransacao)) {
      return res.status(400).send('Valor inválido. Insira um número.');
    }

    // Verifica a conta bancária no banco de dados
    const conta = await ContaBancaria.findOne({ where: { ID_Conta: contaId, ID_Usuario: usuarioId } });
    if (!conta) {
      return res.status(404).send('Conta bancária não encontrada.');
    }

    const saldoAtual = parseFloat(conta.saldo_atual) || 0;

    // Se o saldo final for negativo, não permitir a transação
    if (saldoAtual + valorTransacao < 0) {
      return res.status(400).send('Saldo insuficiente para realizar a transação.');
    }

    // Atualiza o saldo da conta
    const novoSaldo = (saldoAtual + valorTransacao).toFixed(2);
    await ContaBancaria.update(
      { saldo_atual: novoSaldo },
      { where: { ID_Conta: contaId } }
    );

    // Salva a transação no histórico
    await Transacao.create({
      ID_Conta: contaId,
      tipo: valorTransacao > 0 ? 'receita' : 'gasto',
      valor: Math.abs(valorTransacao),
      descricao: valorTransacao > 0 ? 'Depósito' : 'Retirada',
      forma_pagamento: formaPagamentoFinal,  // Usa o valor final da forma de pagamento
      data_transacao: new Date(),
    });

    res.redirect('/usuario'); // Redireciona para a página do usuário
  } catch (error) {
    console.error('Erro ao realizar a transação:', error);
    res.status(500).send('Erro ao realizar a transação.');
  }
});
// Rota para realizar transação
// Rota para realizar a transação
app.post('/transacao/realizar', async (req, res) => {
  const { usuarioOrigem, usuarioDestino, valor, tipoTransacao, formaPagamento } = req.body;

  // Verificação de dados
  if (!usuarioOrigem || !usuarioDestino || !valor || !tipoTransacao || !formaPagamento) {
    return res.status(400).send('Dados inválidos ou ausentes');
  }

  try {
    const valorTransacao = parseFloat(valor);
    if (isNaN(valorTransacao)) {
      return res.status(400).send('Valor inválido');
    }

    // Chama a função para realizar a transação
    await realizarTransacao(usuarioOrigem, usuarioDestino, valorTransacao, tipoTransacao, formaPagamento);
    res.redirect('/relatorio');  // Redireciona para o relatório após a transação

  } catch (error) {
    console.error('Erro ao realizar transação:', error.message);
    res.status(500).send(`Erro ao realizar a transação: ${error.message}`);
  }
});

app.get('/usuario', async (req, res) => {
    try {
        const usuarios = await Usuario.findAll();
        const contas = await ContaBancaria.findAll();

        // Renderize a página com EJS, passando os dados
        res.render('usuario', { usuarios, contas });
    } catch (error) {
        console.error(error);
        res.status(500).send('<h2>Erro ao buscar os usuários</h2>');
    }
});



// Nova rota para retornar usuários como JSON
app.get('/api/usuarios', async (req, res) => {
    try {
        const usuarios = await Usuario.findAll();
        const contas = await ContaBancaria.findAll();
          // Renderize a página com EJS, passando os dados
        res.render('usuario', { usuarios, contas });
    } catch (error) {
        console.error(error);
        res.status(500).send('<h2>Erro ao buscar os usuários</h2>');
    }
});


app.get('/contaBancaria', async (req, res) => {
    try {
      const contas = await ContaBancaria.findAll();
       // Renderize a página com EJS, passando os dados
       res.render('contaBancaria', { contas });
    } catch (error) {
        console.error(error);
        res.status(500).send('<h2>Erro ao buscar os usuários</h2>');
    }
});
  
app.get('/api/contaBancaria', async (req, res) => {
    try {
        const contas = await ContaBancaria.findAll();
        res.json(contas);
      } catch (error) {
        console.error(error);
        res.status(500).send('Erro ao buscar contas bancárias');
      }
})

app.post('/cadastroUsuario', async (req, res) => {
    try {
        const { nome, email, senha, telefone, data_nascimento } = req.body;

        const usuarioExistente = await Usuario.findOne({ where: { email } });
        if (usuarioExistente) {
            return res.send('<h2>Usuário já existe</h2>');
        }

        const novoUsuario = await Usuario.create({ nome, email, senha, telefone, data_nascimento });

        const novaConta = await ContaBancaria.create({
            ID_Usuario: novoUsuario.ID_Usuario,
            banco: 'Banco Fortis',
            agencia: '0001',
            conta: `${Math.floor(Math.random() * 100000000)}`,
            tipo_conta: 'Conta Corrente',
            saldo_atual: 0.00,
        });

        console.log('Conta criada com sucesso para o usuário ${novoUsuario.nome}:', novaConta);
        res.redirect('/landingPage');
    } catch (error) {
        console.error(error);
        res.status(500).send('<h2>Erro no servidor</h2>');
    }
});

app.get('/relatorio', async (req, res) => {
  try {
    // Buscar o usuário
    const usuario = await Usuario.findOne({ where: { ID_Usuario: 1 } });
    if (!usuario) return res.status(404).send('Usuário não encontrado');

    // Buscar contas do usuário
    const contas = await ContaBancaria.findAll({ where: { ID_Usuario: usuario.ID_Usuario } });
    const contasIds = contas.map(conta => conta.ID_Conta);

    // Buscar transações associadas às contas
    const transacoes = await Transacao.findAll({ where: { ID_Conta: contasIds } });

    // Garantir que saldo_atual é um número e calcular o total
    const totalSaldo = contas.reduce((acc, conta) => acc + (parseFloat(conta.saldo_atual) || 0), 0);

    // Número total de transações
    const totalTransacoes = transacoes.length;

    // Calcular o total de depósitos
    const totalDepositos = transacoes
      .filter(transacao => transacao.tipo === 'deposito')
      .reduce((acc, transacao) => acc + (parseFloat(transacao.valor) || 0), 0);

    // Calcular o total de gastos
    const totalGastos = transacoes
      .filter(transacao => transacao.tipo === 'gasto')
      .reduce((acc, transacao) => acc + (parseFloat(transacao.valor) || 0), 0);

    // Renderizar o relatório
    res.render('relatorio', {
      usuario,
      transacoes,
      totalSaldo,
      totalTransacoes,
      totalDepositos,
      totalGastos,
    });
  } catch (error) {
    console.error('Erro ao gerar relatório:', error);
    res.status(500).send('Erro ao gerar relatório');
  }
});

app.post('/usuario/subtrairSaldo', async (req, res) => {
  const { usuarioId, contaId, valor } = req.body;

  // Verificar se o valor enviado é válido
  if (isNaN(parseFloat(valor)) || parseFloat(valor) <= 0) {
    return res.status(400).send('Valor inválido. Insira um valor maior que zero.');
  }

  try {
    // Buscar a conta bancária no banco de dados
    const conta = await ContaBancaria.findOne({ where: { ID_Conta: contaId, ID_Usuario: usuarioId } });

    if (!conta) {
      return res.status(404).send('Conta não encontrada.');
    }

    // Validar se há saldo suficiente
    const saldoAtual = parseFloat(conta.saldo_atual);
    const valorRemover = parseFloat(valor);

    if (valorRemover > saldoAtual) {
      return res.status(400).send('Saldo insuficiente para a operação.');
    }

    // Atualizar o saldo
    const novoSaldo = saldoAtual - valorRemover;

    await ContaBancaria.update(
      { saldo_atual: novoSaldo.toFixed(2) }, // Atualiza o saldo no banco
      { where: { ID_Conta: contaId } }
    );

    // Registrar a transação como "gasto"
    await Transacao.create({
      ID_Conta: contaId,
      tipo: 'gasto',
      valor: valorRemover,
      descricao: 'Saldo removido: ${valorRemover.toFixed(2)}',
      forma_pagamento: 'ajuste',
      data_transacao: new Date()
    });

    // Redirecionar ou enviar uma resposta
    res.redirect('/usuario'); // Atualiza a página do usuário com o saldo reduzido
  } catch (error) {
    console.error('Erro ao subtrair saldo:', error);
    res.status(500).send('Erro ao realizar a operação.');
  }
});

// Rota GET para renderizar a página de categorias
app.get('/categoria', async (req, res) => {
  try {
    const categorias = await Categoria.findAll();
    res.render('categoria', { categorias });
  } catch (error) {
    console.error('Erro ao buscar categorias:', error);
    res.status(500).send('Erro ao buscar categorias');
  }
});

// Rota POST para adicionar uma nova categoria
app.post('/categoria/adicionar', async (req, res) => {
  const { nome, descricao } = req.body;

  if (!nome) {
    return res.status(400).send('Nome da categoria é obrigatório');
  }

  try {
    const novaCategoria = await Categoria.create({ nome, descricao });
    console.log('Categoria adicionada:', novaCategoria);
    res.redirect('/categoria');  // Redireciona para a lista de categorias
  } catch (error) {
    console.error('Erro ao adicionar categoria:', error);
    res.status(500).send('Erro ao adicionar categoria');
  }
});


Usuario.findAll().then(usuarios => {
    console.log('Usuários:', JSON.stringify(usuarios, null, 2));
}).catch(err => {
    console.error('Erro ao buscar usuários:', err);
});

app.listen(port, () => {
  console.log('Server running on port 4000');
});

// 