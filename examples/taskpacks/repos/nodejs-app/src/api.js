function listUsers(req, res) { res.json({ users: [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }] }); }
function getUser(req, res) { res.json({ id: req.params.id, name: "Alice" }); }
function createUser(req, res) { res.status(201).json({ id: 3, name: req.body.name }); }
function updateUser(req, res) { res.json({ id: req.params.id, name: req.body.name }); }
function deleteUser(req, res) { res.status(204).send(); }
function healthCheck(req, res) { res.json({ status: "ok", uptime: process.uptime() }); }
module.exports = { listUsers, getUser, createUser, updateUser, deleteUser, healthCheck };
