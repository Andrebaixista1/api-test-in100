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

const checkAuthIp = (req, res, next) => {
  const headerIp = req.headers["x-client-ip"];
  let ip = headerIp || req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  ip = ip.replace(/^::ffff:/, "");
  if (ip !== "201.0.21.143") {
    return res.status(403).json({ success: false, message: "IP não autorizado" });
  }
  next();
};

const checkAuthIpInsert = (req, res, next) => {
  const headerIp = req.headers["x-client-ip"];
  let ip = headerIp || req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  ip = ip.replace(/^::ffff:/, "");
  if (ip !== "201.0.21.143") {
    return res.status(403).json({ success: false, message: "IP não autorizado" });
  }
  next();
};

app.get("/api/auth-ips", checkAuthIp, (req, res) => {
  const query = `
    SELECT
      id,
      ip_address,
      description,
      DATE_FORMAT(data_ativacao, '%d/%m/%Y %H:%i:%s') AS data_ativacao,
      DATE_FORMAT(data_vencimento, '%d/%m/%Y %H:%i:%s') AS data_vencimento,
      limite_consultas_mensal,
      carregado
    FROM auth_ip2
    ORDER BY id DESC
  `;
  pool.query(query, (err, results) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
    res.json({ success: true, data: results });
  });
});

app.post("/api/auth-ips", checkAuthIp, (req, res) => {
  const { ip_address, description, data_vencimento, limite_consultas_mensal } = req.body;
  if (!ip_address || !data_vencimento || !limite_consultas_mensal) {
    return res.status(400).json({ success: false, message: "Dados incompletos" });
  }
  const novoLimite = parseInt(limite_consultas_mensal, 10) || 0;
  pool.query("SELECT id, carregado FROM auth_ip2 WHERE ip_address = ?", [ip_address], (selErr, selRes) => {
    if (selErr) {
      return res.status(500).json({ success: false, error: selErr.message });
    }
    if (selRes.length > 0) {
      const oldCarregado = selRes[0].carregado || 0;
      const somaCarregado = oldCarregado + novoLimite;
      const updateQuery = `
        UPDATE auth_ip2
        SET description = ?, data_vencimento = ?, limite_consultas_mensal = ?, carregado = ?
        WHERE id = ?
      `;
      pool.query(
        updateQuery,
        [description, data_vencimento, novoLimite, somaCarregado, selRes[0].id],
        (upErr) => {
          if (upErr) {
            return res.status(500).json({ success: false, error: upErr.message });
          }
          return res.json({ success: true, message: "Registro atualizado e limite somado com sucesso!" });
        }
      );
    } else {
      const insertQuery = `
        INSERT INTO auth_ip2
          (ip_address, description, data_ativacao, data_vencimento, limite_consultas_mensal, carregado)
        VALUES
          (?, ?, NOW(), ?, ?, ?)
      `;
      pool.query(insertQuery, [ip_address, description, data_vencimento, novoLimite, novoLimite], (inErr, inRes) => {
        if (inErr) {
          return res.status(500).json({ success: false, error: inErr.message });
        }
        return res.json({ success: true, message: "Registro criado com sucesso!", insertId: inRes.insertId });
      });
    }
  });
});

app.put("/api/auth-ips/:id", checkAuthIp, (req, res) => {
  const { id } = req.params;
  const { ip_address, description, data_vencimento, limite_consultas_mensal } = req.body;
  const novoLimite = parseInt(limite_consultas_mensal, 10) || 0;
  pool.query("SELECT carregado FROM auth_ip2 WHERE id = ?", [id], (selErr, selRes) => {
    if (selErr) {
      return res.status(500).json({ success: false, error: selErr.message });
    }
    if (!selRes.length) {
      return res.status(404).json({ success: false, message: "Registro não encontrado." });
    }
    const oldCarregado = selRes[0].carregado || 0;
    const somaCarregado = oldCarregado + novoLimite;
    const query = `
      UPDATE auth_ip2
      SET ip_address = ?, description = ?, data_vencimento = ?, limite_consultas_mensal = ?, carregado = ?
      WHERE id = ?
    `;
    const params = [ip_address, description, data_vencimento, novoLimite, somaCarregado, id];
    pool.query(query, params, (err) => {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
      res.json({ success: true, message: "Registro atualizado e limite somado com sucesso!" });
    });
  });
});

app.delete("/api/auth-ips/:id", checkAuthIp, (req, res) => {
  const { id } = req.params;
  const query = "DELETE FROM auth_ip2 WHERE id = ?";
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

app.get("/api/limit", (req, res) => {
  const headerIp = req.headers["x-client-ip"];
  let ip = headerIp || req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  ip = ip.replace(/^::ffff:/, "");
  if (ip !== "201.0.21.143") {
    return res.status(403).json({ success: false, message: "IP não autorizado" });
  }
  pool.query(
    "SELECT limite_consultas_mensal FROM auth_ip2 WHERE ip_address = ? AND DATE(data_vencimento) >= CURDATE()",
    [ip],
    (err, results) => {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
      if (results.length === 0) {
        return res.status(200).json({ success: false, limite: 0 });
      }
      res.json({ success: true, limite: results[0].limite_consultas_mensal });
    }
  );
});

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

app.post("/api/insert", checkAuthIpInsert, (req, res) => {
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
    data.nome_arquivo,
  ];
  pool.query(query, params, (err) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
    pool.query(
      "UPDATE auth_ip2 SET limite_consultas_mensal = GREATEST(limite_consultas_mensal - 1, 0) WHERE ip_address = ?",
      [req.clientIp],
      (updateErr) => {
        if (updateErr) {
          console.error("Erro ao atualizar limite_consultas_mensal:", updateErr.message);
        }
        res.json({ success: true, results: "Dados inseridos/atualizados com sucesso!" });
      }
    );
  });
});

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
