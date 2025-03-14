// BACKEND (index.js)
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const cron = require("node-cron");
require("dotenv").config();

const app = express();
app.use(express.json());

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:20251",
      "https://vieirain100-2.vercel.app",
      "https://consulta-in100-vi.vercel.app",
      "https://api-js-in100.vercel.app",
      "https://libera-ip.vercel.app",
      "https://api-in100v2.vercel.app",
    ],
    methods: ["GET", "POST", "DELETE", "OPTIONS", "PUT"],
    allowedHeaders: ["Content-Type", "Authorization", "apiKey", "x-client-ip"],
  })
);

const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: 3306,
};

const pool = mysql.createPool(dbConfig);

// Middleware de autenticação de IP
const checkAuthIp = (req, res, next) => {
  const headerIp = req.headers["x-client-ip"];
  let ip = headerIp || req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  ip = ip.replace(/^::ffff:/, "");
  pool.query(
    "SELECT * FROM ip_data WHERE ip = ? AND DATE(data_vencimento) >= CURDATE()",
    [ip],
    (err, results) => {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
      if (results.length === 0) {
        return res.status(403).json({ success: false, message: "IP não autorizado" });
      }
      next();
    }
  );
};

const checkAuthIp2 = (req, res, next) => {
  const headerIp = req.headers["x-client-ip"];
  let ip = headerIp || req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  ip = ip.replace(/^::ffff:/, "");
  if (ip !== "201.0.21.143" && ip !== "45.224.161.116") {
    return res.status(403).json({ success: false, message: "IP não autorizado" });
  }
  next();
};

// Endpoint para visualizar os IPs autorizados
app.get("/api/auth-ips", checkAuthIp2, (req, res) => {
  const query = `
    SELECT
      id,
      ip,
      descricao,
      DATE_FORMAT(data_adicao, '%d/%m/%Y %H:%i:%s') AS data_adicao,
      DATE_FORMAT(data_vencimento, '%d/%m/%Y') AS data_vencimento,
      limite_consultas,
      total_carregado
    FROM ip_data
    ORDER BY id DESC
  `;
  pool.query(query, (err, results) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
    res.json({ success: true, data: results });
  });
});

// Endpoint para criar/atualizar IPs autorizados
app.post("/api/auth-ips", checkAuthIp2, (req, res) => {
  const { ip, descricao, data_vencimento, limite_consultas } = req.body;
  if (!ip || !data_vencimento || !limite_consultas) {
    return res.status(400).json({ success: false, message: "Dados incompletos" });
  }
  const novoLimite = parseInt(limite_consultas, 10) || 0;
  pool.query("SELECT id, total_carregado FROM ip_data WHERE ip = ?", [ip], (selErr, selRes) => {
    if (selErr) {
      return res.status(500).json({ success: false, error: selErr.message });
    }
    if (selRes.length > 0) {
      const oldtotal_carregado = selRes[0].total_carregado || 0;
      const somatotal_carregado = oldtotal_carregado + novoLimite;
      const updateQuery = `
        UPDATE ip_data
        SET descricao = ?, data_vencimento = ?, limite_consultas = ?, total_carregado = ?
        WHERE id = ?
      `;
      pool.query(
        updateQuery,
        [descricao, data_vencimento, novoLimite, somatotal_carregado, selRes[0].id],
        (upErr) => {
          if (upErr) {
            return res.status(500).json({ success: false, error: upErr.message });
          }
          return res.json({ success: true, message: "Registro atualizado e limite somado com sucesso!" });
        }
      );
    } else {
      const insertQuery = `
        INSERT INTO ip_data
          (ip, descricao, data_adicao, data_vencimento, limite_consultas, total_carregado)
        VALUES
          (?, ?, NOW(), ?, ?, ?)
      `;
      pool.query(insertQuery, [ip, descricao, data_vencimento, novoLimite, novoLimite], (inErr, inRes) => {
        if (inErr) {
          return res.status(500).json({ success: false, error: inErr.message });
        }
        return res.json({ success: true, message: "Registro criado com sucesso!", insertId: inRes.insertId });
      });
    }
  });
});

// Endpoint para atualizar IPs autorizados
app.put("/api/auth-ips/:id", checkAuthIp2, (req, res) => {
  const { id } = req.params;
  const { ip, descricao, data_vencimento, limite_consultas } = req.body;
  const novoLimite = parseInt(limite_consultas, 10) || 0;
  pool.query("SELECT total_carregado FROM ip_data WHERE id = ?", [id], (selErr, selRes) => {
    if (selErr) {
      return res.status(500).json({ success: false, error: selErr.message });
    }
    if (!selRes.length) {
      return res.status(404).json({ success: false, message: "Registro não encontrado." });
    }
    const oldtotal_carregado = selRes[0].total_carregado || 0;
    const somatotal_carregado = oldtotal_carregado + novoLimite;
    const query = `
      UPDATE ip_data
      SET ip = ?, descricao = ?, data_vencimento = ?, limite_consultas = ?, total_carregado = ?
      WHERE id = ?
    `;
    const params = [ip, descricao, data_vencimento, novoLimite, somatotal_carregado, id];
    pool.query(query, params, (err) => {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
      res.json({ success: true, message: "Registro atualizado e limite somado com sucesso!" });
    });
  });
});

// Endpoint para deletar IPs autorizados
app.delete("/api/auth-ips/:id", checkAuthIp2, (req, res) => {
  const { id } = req.params;
  const query = "DELETE FROM ip_data WHERE id = ?";
  pool.query(query, [id], (err, result) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Registro não encontrado." });
    }
    res.json({ success: true, message: "Registro excluído com sucesso!" });
  });
});

// Endpoint para obter o limite mensal
app.get("/api/limit", (req, res) => {
  const headerIp = req.headers["x-client-ip"];
  let ip = headerIp || req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  ip = ip.replace(/^::ffff:/, "");
  console.log("IP detectado em /api/limit:", ip);
  pool.query(
    "SELECT SUM(limite_consultas) as total_limite FROM ip_data WHERE ip = ? AND DATE(data_vencimento) >= CURDATE()",
    [ip],
    (err, results) => {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
      const total_limite = results[0].total_limite || 0;
      res.json({ success: true, limite: total_limite });
    }
  );
});

// Endpoint para teste de conexão com a tabela inss_higienizado
app.get("/test", (req, res) => {
  pool.query("SELECT * FROM inss_higienizado LIMIT 1", (err, results) => {
    if (err) {
      return res.status(500).json({ status: "error", message: err.message });
    }
    if (results.length > 0) {
      res.json({
        status: "success",
        message: "API conectada ao MySQL!",
        data: results[0],
      });
    } else {
      res.json({
        status: "success",
        message: "API rodando, mas a tabela inss_higienizado está vazia.",
      });
    }
  });
});

// Função auxiliar para atualizar o limite de consultas do IP
const updateIpLimit = (req, res, callback) => {
  const headerIp = req.headers["x-client-ip"];
  let clientIp = headerIp || req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  clientIp = clientIp.replace(/^::ffff:/, "");
  const updateQuery = `
    UPDATE ip_data AS main
    JOIN (
      SELECT id
      FROM ip_data
      WHERE ip = ?
        AND DATE(data_vencimento) >= CURDATE()
        AND limite_consultas > 0
      ORDER BY data_adicao DESC
      LIMIT 1
    ) AS sub ON main.id = sub.id
    SET main.limite_consultas = GREATEST(main.limite_consultas - 1, 0)
  `;
  pool.query(updateQuery, [clientIp], (updateErr) => {
    if (updateErr) {
      console.error("Erro ao atualizar limite_consultas:", updateErr.message);
    }
    callback();
  });
};

// Endpoint para inserir ou duplicar registro na tabela inss_higienizado
app.post("/api/insert", checkAuthIp, (req, res) => {
  const data = req.body;
  const cpf = data.numero_documento;
  const nb = data.numero_beneficio;

  const checkQuery = `
    SELECT *
    FROM inss_higienizado
    WHERE numero_documento = ? AND numero_beneficio = ?
    LIMIT 1
  `;
  pool.query(checkQuery, [cpf, nb], (checkErr, checkResults) => {
    if (checkErr) {
      return res.status(500).json({ success: false, error: checkErr.message });
    }
    if (checkResults.length > 0) {
      // Se já existir, duplicar usando os dados já salvos (exceto os campos a serem atualizados)
      const existing = checkResults[0];
      const newRecord = {
        numero_beneficio: existing.numero_beneficio,
        numero_documento: existing.numero_documento,
        nome: existing.nome,
        estado: existing.estado,
        pensao: existing.pensao,
        data_nascimento: existing.data_nascimento,
        tipo_bloqueio: existing.tipo_bloqueio,
        data_concessao: existing.data_concessao,
        tipo_credito: existing.tipo_credito,
        limite_cartao_beneficio: existing.limite_cartao_beneficio,
        saldo_cartao_beneficio: existing.saldo_cartao_beneficio,
        status_beneficio: existing.status_beneficio,
        data_fim_beneficio: existing.data_fim_beneficio,
        limite_cartao_consignado: existing.limite_cartao_consignado,
        saldo_cartao_consignado: existing.saldo_cartao_consignado,
        saldo_credito_consignado: existing.saldo_credito_consignado,
        saldo_total_maximo: existing.saldo_total_maximo,
        saldo_total_utilizado: existing.saldo_total_utilizado,
        saldo_total_disponivel: existing.saldo_total_disponivel,
        data_consulta: existing.data_consulta,
        data_retorno_consulta: existing.data_retorno_consulta,
        tempo_retorno_consulta: existing.tempo_retorno_consulta,
        nome_representante_legal: existing.nome_representante_legal,
        banco_desembolso: existing.banco_desembolso,
        agencia_desembolso: existing.agencia_desembolso,
        numero_conta_desembolso: existing.numero_conta_desembolso,
        digito_conta_desembolso: existing.digito_conta_desembolso,
        numero_portabilidades: existing.numero_portabilidades,
        ip_origem: data.ip_origem,
        data_hora_registro: data.data_hora_registro,
        nome_arquivo: data.nome_arquivo
      };
      const duplicateQuery = `
        INSERT INTO inss_higienizado (
          numero_beneficio, numero_documento, nome, estado, pensao, data_nascimento,
          tipo_bloqueio, data_concessao, tipo_credito, limite_cartao_beneficio, saldo_cartao_beneficio,
          status_beneficio, data_fim_beneficio, limite_cartao_consignado, saldo_cartao_consignado,
          saldo_credito_consignado, saldo_total_maximo, saldo_total_utilizado, saldo_total_disponivel,
          data_consulta, data_retorno_consulta, tempo_retorno_consulta, nome_representante_legal,
          banco_desembolso, agencia_desembolso, numero_conta_desembolso, digito_conta_desembolso,
          numero_portabilidades, ip_origem, data_hora_registro, nome_arquivo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const dupParams = [
        newRecord.numero_beneficio,
        newRecord.numero_documento,
        newRecord.nome,
        newRecord.estado,
        newRecord.pensao,
        newRecord.data_nascimento,
        newRecord.tipo_bloqueio,
        newRecord.data_concessao,
        newRecord.tipo_credito,
        newRecord.limite_cartao_beneficio,
        newRecord.saldo_cartao_beneficio,
        newRecord.status_beneficio,
        newRecord.data_fim_beneficio,
        newRecord.limite_cartao_consignado,
        newRecord.saldo_cartao_consignado,
        newRecord.saldo_credito_consignado,
        newRecord.saldo_total_maximo,
        newRecord.saldo_total_utilizado,
        newRecord.saldo_total_disponivel,
        newRecord.data_consulta,
        newRecord.data_retorno_consulta,
        newRecord.tempo_retorno_consulta,
        newRecord.nome_representante_legal,
        newRecord.banco_desembolso,
        newRecord.agencia_desembolso,
        newRecord.numero_conta_desembolso,
        newRecord.digito_conta_desembolso,
        newRecord.numero_portabilidades,
        newRecord.ip_origem,
        newRecord.data_hora_registro,
        newRecord.nome_arquivo
      ];
      pool.query(duplicateQuery, dupParams, (dupErr, dupRes) => {
        if (dupErr) {
          return res.status(500).json({ success: false, error: dupErr.message });
        }
        updateIpLimit(req, res, () => {
          return res.json({
            success: true,
            message: "Registro duplicado com sucesso!",
            insertId: dupRes.insertId
          });
        });
      });
    } else {
      // Se não encontrar, chama a API externa para obter os dados e inserir
      fetch("https://api.ajin.io/v3/query-inss-balances/finder/await", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apiKey: process.env.REACT_APP_API_KEY
        },
        body: JSON.stringify({
          identity: cpf,
          benefitNumber: nb,
          lastDays: 0,
          attempts: 60
        })
      })
      .then(response => response.json())
      .then(apiData => {
        const insertQuery = `
          INSERT INTO inss_higienizado (
            id, numero_beneficio, numero_documento, nome, estado, pensao, data_nascimento,
            tipo_bloqueio, data_concessao, tipo_credito, limite_cartao_beneficio, saldo_cartao_beneficio,
            status_beneficio, data_fim_beneficio, limite_cartao_consignado, saldo_cartao_consignado,
            saldo_credito_consignado, saldo_total_maximo, saldo_total_utilizado, saldo_total_disponivel,
            data_consulta, data_retorno_consulta, tempo_retorno_consulta, nome_representante_legal,
            banco_desembolso, agencia_desembolso, numero_conta_desembolso, digito_conta_desembolso,
            numero_portabilidades, ip_origem, data_hora_registro, nome_arquivo
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const params = [
          apiData.id,
          apiData.benefitNumber,
          apiData.documentNumber,
          apiData.name,
          apiData.state,
          apiData.alimony,
          apiData.birthDate,
          apiData.blockType,
          apiData.grantDate,
          apiData.creditType,
          apiData.benefitCardLimit,
          apiData.benefitCardBalance,
          apiData.benefitStatus,
          apiData.benefitEndDate,
          apiData.consignedCardLimit,
          apiData.consignedCardBalance,
          apiData.consignedCreditBalance,
          apiData.maxTotalBalance,
          apiData.usedTotalBalance,
          apiData.availableTotalBalance,
          apiData.queryDate,
          apiData.queryReturnDate,
          apiData.queryReturnTime,
          apiData.legalRepresentativeName,
          apiData.disbursementBankAccount ? apiData.disbursementBankAccount.bank : null,
          apiData.disbursementBankAccount ? apiData.disbursementBankAccount.branch : null,
          apiData.disbursementBankAccount ? apiData.disbursementBankAccount.number : null,
          apiData.disbursementBankAccount ? apiData.disbursementBankAccount.digit : null,
          apiData.numberOfPortabilities,
          data.ip_origem,
          data.data_hora_registro,
          data.nome_arquivo
        ];
        pool.query(insertQuery, params, (inErr, inRes) => {
          if (inErr) {
            return res.status(500).json({ success: false, error: inErr.message });
          }
          updateIpLimit(req, res, () => {
            return res.json({
              success: true,
              message: "Registro inserido com sucesso!",
              insertId: inRes.insertId
            });
          });
        });
      })
      .catch(apiErr => {
        return res.status(500).json({ success: false, error: apiErr.message });
      });
    }
  });
});



// Endpoint para deletar registros da tabela inss_higienizado por nome_arquivo
app.delete("/api/delete", checkAuthIp, (req, res) => {
  const nome_arquivo = req.query.nome_arquivo;
  if (!nome_arquivo) {
    return res.status(400).json({ success: false, message: "nome_arquivo é obrigatório" });
  }
  const query = "DELETE FROM inss_higienizado WHERE nome_arquivo = ?";
  pool.query(query, [nome_arquivo], (err, result) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
    res.json({ success: true, results: `${result.affectedRows} registros excluídos` });
  });
});

// Endpoint para download dos registros da tabela inss_higienizado por nome_arquivo
app.get("/api/download", checkAuthIp, (req, res) => {
  const nome_arquivo = req.query.nome_arquivo;
  if (!nome_arquivo) {
    return res.status(400).json({ success: false, message: "nome_arquivo é obrigatório" });
  }
  const query = "SELECT * FROM inss_higienizado WHERE nome_arquivo = ?";
  pool.query(query, [nome_arquivo], (err, results) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
    res.json({ success: true, data: results });
  });
});

app.listen(5000, () => {
  console.log("Server is running on port 5000");
});


cron.schedule("0 0 * * *", () => {
  const deleteQuery = `
    DELETE FROM inss_higienizado
    WHERE data_hora_registro < DATE_SUB(NOW(), INTERVAL 30 DAY)
  `;
  pool.query(deleteQuery, (err, results) => {
    if (err) {
      console.error("Erro ao excluir registros antigos:", err.message);
    } else {
      console.log(`${results.affectedRows} registros antigos excluídos.`);
    }
  });
});