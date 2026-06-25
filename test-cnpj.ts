const cleanCnpj = "78989659798080";
const formattedCnpj = cleanCnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
console.log(formattedCnpj);
