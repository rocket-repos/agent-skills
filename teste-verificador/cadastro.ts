// Arquivo de teste do Verificador de Conformidade: este PR não deve ser mergeado.
interface Cliente {
  nome: string
  cpf: string
}

export function registrarCadastro(cliente: Cliente): void {
  console.log('cadastro recebido', { nome: cliente.nome, cpf: cliente.cpf })
}
