const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const cron = require('node-cron'); // Para agendar tarefas

const app = express();

// Middleware para JSON e CORS
app.use(express.json());
app.use(
  cors({
    origin: [
      'https://vieirain100-2.vercel.app',
      'http://localhost:3000' // para ambiente local
    ],
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);

// Configuração do pool de conexões MySQL
const dbConfig = {
  host: '45.179.91.180',
  user: 'andrefelipe',
  password: '899605aA@',
  database: 'vieira_online',
  port: 3306
};

const pool = mysql.createPool(dbConfig);

// Middleware para verificar IP autorizado e data de vencimento
const checkAuthIp = (req, res, next) => {
  const requestIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const ip = requestIp.replace(/^::ffff:/, '');
  const now = new Date();
  const currentDate = now.toISOString().slice(0, 19).replace('T', ' ');  // Formato 'YYYY-MM-DD HH:mm:ss'

  // Verifica se o IP está cadastrado E se a data_vencimento não expirou
  pool.query(
    "SELECT * FROM auth_ip2 WHERE ip_address = ? AND data_vencimento >= ?",
    [ip, currentDate],
    (err, results) => {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
      if (results.length === 0) {
        return res.status(403).json({ success: false, message: "IP não autorizado ou vencido" });
      }
      next();
    }
  );
};

// Rota de teste (não protegida)
app.get('/test', checkAuthIp, (req, res) => {
  pool.query('SELECT * FROM inss_higienizado LIMIT 1', (err, results) => {
    if (err) {
      return res.status(500).json({ status: 'error', message: err.message });
    }
    if (results.length > 0) {
      res.json({
        status: 'success',
        message: 'API está rodando e conectada ao MySQL!',
        data: results[0]
      });
    } else {
      res.json({
        status: 'success',
        message: 'API está rodando, mas a tabela inss_higienizado está vazia.'
      });
    }
  });
});

// Rota de inserção com atualização se já existir o mesmo CPF e NB
app.post('/api/insert', checkAuthIp, (req, res) => {
  const data = req.body;
  const query = `
    INSERT INTO inss_higienizado (
      id, numero_beneficio, numero_documento, nome, estado, pensao, data_nascimento,
      tipo_bloqueio, data_concessao, tipo_credito, limite_cartao_beneficio, saldo_cartao_beneficio,
      status_beneficio, data_fim_beneficio, limite_cartao_consignado, saldo_cartao_consignado,
      saldo_credito_consignado, saldo_total_maximo, saldo_total_utilizado, saldo_total_disponivel,
      data_consulta, data_retorno_consulta, tempo_retorno_consulta, nome_representante_legal,
      banco_desembolso, agencia_desembolso, numero_conta_desembolso, digito_conta_desembolso,
      numero_portabilidades, ip_origem, data_hora_registro, nome_arquivo
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      nome = VALUES(nome),
      estado = VALUES(estado),
      pensao = VALUES(pensao),
      data_nascimento = VALUES(data_nascimento),
      tipo_bloqueio = VALUES(tipo_bloqueio),
      data_concessao = VALUES(data_concessao),
      tipo_credito = VALUES(tipo_credito),
      limite_cartao_beneficio = VALUES(limite_cartao_beneficio),
      saldo_cartao_beneficio = VALUES(saldo_cartao_beneficio),
      status_beneficio = VALUES(status_beneficio),
      data_fim_beneficio = VALUES(data_fim_beneficio),
      limite_cartao_consignado = VALUES(limite_cartao_consignado),
      saldo_cartao_consignado = VALUES(saldo_cartao_consignado),
      saldo_credito_consignado = VALUES(saldo_credito_consignado),
      saldo_total_maximo = VALUES(saldo_total_maximo),
      saldo_total_utilizado = VALUES(saldo_total_utilizado),
      saldo_total_disponivel = VALUES(saldo_total_disponivel),
      data_consulta = VALUES(data_consulta),
      data_retorno_consulta = VALUES(data_retorno_consulta),
      tempo_retorno_consulta = VALUES(tempo_retorno_consulta),
      nome_representante_legal = VALUES(nome_representante_legal),
      banco_desembolso = VALUES(banco_desembolso),
      agencia_desembolso = VALUES(agencia_desembolso),
      numero_conta_desembolso = VALUES(numero_conta_desembolso),
      digito_conta_desembolso = VALUES(digito_conta_desembolso),
      numero_portabilidades = VALUES(numero_portabilidades),
      ip_origem = VALUES(ip_origem),
      data_hora_registro = VALUES(data_hora_registro),
      nome_arquivo = VALUES(nome_arquivo)
  `;
  const params = [
    data.id,
    data.numero_beneficio,
    data.numero_documento,
    data.nome,
    data.estado,
    data.pensao,
    data.data_nascimento,
    data.tipo_bloqueio,
    data.data_concessao,
    data.tipo_credito,
    data.limite_cartao_beneficio,
    data.saldo_cartao_beneficio,
    data.status_beneficio,
    data.data_fim_beneficio,
    data.limite_cartao_consignado,
    data.saldo_cartao_consignado,
    data.saldo_credito_consignado,
    data.saldo_total_maximo,
    data.saldo_total_utilizado,
    data.saldo_total_disponivel,
    data.data_consulta,
    data.data_retorno_consulta,
    data.tempo_retorno_consulta,
    data.nome_representante_legal,
    data.banco_desembolso,
    data.agencia_desembolso,
    data.numero_conta_desembolso,
    data.digito_conta_desembolso,
    data.numero_portabilidades,
    data.ip_origem,
    data.data_hora_registro,
    data.nome_arquivo
  ];
  pool.query(query, params, (err, result) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
    res.json({ success: true, results: 'Dados inseridos/atualizados com sucesso!' });
  });
});

// DELETE: exclui todos os registros com o mesmo nome_arquivo
app.delete('/api/delete', checkAuthIp, (req, res) => {
  const nome_arquivo = req.query.nome_arquivo;
  if (!nome_arquivo) {
    return res.status(400).json({ success: false, message: 'nome_arquivo é obrigatório' });
  }
  const query = 'DELETE FROM inss_higienizado WHERE nome_arquivo = ?';
  pool.query(query, [nome_arquivo], (err, result) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
    res.json({ success: true, results: `${result.affectedRows} registros excluídos` });
  });
});

// GET: retorna os registros com o mesmo nome_arquivo para download
app.get('/api/download', checkAuthIp, (req, res) => {
  const nome_arquivo = req.query.nome_arquivo;
  if (!nome_arquivo) {
    return res.status(400).json({ success: false, message: 'nome_arquivo é obrigatório' });
  }
  const query = 'SELECT * FROM inss_higienizado WHERE nome_arquivo = ?';
  pool.query(query, [nome_arquivo], (err, results) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
    res.json({ success: true, data: results });
  });
});

// Inicia o servidor
app.listen(5000, () => {
  console.log('Server is running on port 5000');
});

// Tarefa agendada: Executa 1 vez por dia para excluir registros antigos da tabela inss_higienizado
cron.schedule('0 0 * * *', () => { // executa diariamente à meia-noite
  const deleteQuery = `
    DELETE FROM inss_higienizado
    WHERE data_hora_registro < DATE_SUB(NOW(), INTERVAL 7 DAY)
  `;
  pool.query(deleteQuery, (err, results) => {
    if (err) {
      console.error("Erro ao excluir registros antigos:", err.message);
    } else {
      console.log(`${results.affectedRows} registros antigos excluídos.`);
    }
  });
});


